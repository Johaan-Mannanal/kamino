"""Atomic admission control for retained job evidence and artifacts."""

import os
import shutil
from contextlib import contextmanager
from pathlib import Path

if os.name == "nt":  # pragma: no cover - exercised on Windows CI/runtime.
    import msvcrt
else:  # pragma: no cover - Windows takes the branch above.
    import fcntl

GIB = 1024**3


class StorageLimitError(ValueError):
    """A retained write would exceed an operator-configured storage limit."""


@contextmanager
def _exclusive_file_lock(path: Path):
    """A one-byte advisory lock that is available on both server platforms."""
    with path.open("a+b") as lock:
        if os.name == "nt":
            lock.seek(0)
            lock.write(b"\0")
            lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        else:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


class StorageBudget:
    """Serialize persistent writes without deleting retained user or provider evidence."""

    def __init__(
        self,
        root: Path,
        max_total_bytes: int = 3 * GIB,
        max_job_bytes: int = 512 * 1024**2,
        min_free_bytes: int = 256 * 1024**2,
    ):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        for name, value in {
            "max_total_bytes": max_total_bytes,
            "max_job_bytes": max_job_bytes,
            "min_free_bytes": min_free_bytes,
        }.items():
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise ValueError(f"{name} must be a non-negative integer")
        self.max_total_bytes = max_total_bytes
        self.max_job_bytes = max_job_bytes
        self.min_free_bytes = min_free_bytes
        self._lock_path = self.root / ".storage-budget.lock"

    @staticmethod
    def _tree_bytes(directory: Path) -> int:
        if not directory.exists():
            return 0
        if directory.is_file() or directory.is_symlink():
            return directory.lstat().st_size
        total = 0
        for base, _, names in os.walk(directory, followlinks=False):
            for name in names:
                path = Path(base, name)
                try:
                    total += path.lstat().st_size
                except FileNotFoundError:
                    # A concurrently abandoned temporary file is not an admission failure.
                    continue
        return total

    def _inside_root(self, path: Path) -> Path:
        resolved = path.resolve()
        if not resolved.is_relative_to(self.root):
            raise ValueError("job storage must remain inside the configured data directory")
        return resolved

    @contextmanager
    def write_admission(self, job_root: Path, additional_bytes: int):
        """Hold a process-wide lock while reserving a known persistent write size.

        Callers must perform the admitted write before this context exits. Existing data is
        deliberately never removed merely because it is over a newly lowered limit.
        """
        if not isinstance(additional_bytes, int) or isinstance(additional_bytes, bool):
            raise ValueError("additional_bytes must be an integer")
        if additional_bytes < 0:
            raise ValueError("additional_bytes must be non-negative")
        job_root = self._inside_root(Path(job_root))
        with _exclusive_file_lock(self._lock_path):
            total = self._tree_bytes(self.root)
            job = self._tree_bytes(job_root)
            free = shutil.disk_usage(self.root).free
            if total + additional_bytes > self.max_total_bytes:
                raise StorageLimitError(
                    "storage budget exhausted; retained artifacts were not changed"
                )
            if job + additional_bytes > self.max_job_bytes:
                raise StorageLimitError(
                    "job storage budget exhausted; retained artifacts were not changed"
                )
            if free - additional_bytes < self.min_free_bytes:
                raise StorageLimitError("storage free-space reserve would be exhausted")
            yield

    def publish_directory(self, staged: Path, destination: Path, job_root: Path) -> Path:
        """Atomically publish a complete staged directory after a budget admission.

        A destination is immutable evidence: this method will never replace a prior attempt.
        ``staged`` must be on the same filesystem as ``destination`` for ``os.replace``.
        """
        staged = Path(staged)
        destination = self._inside_root(Path(destination))
        job_root = self._inside_root(Path(job_root))
        if not staged.is_dir():
            raise ValueError("staged publication must be a directory")
        if destination.exists():
            raise FileExistsError(destination)
        # Same-job private scratch is already included in both scans below. Moving
        # it to the immutable destination consumes no additional bytes or disk space.
        additional = 0 if staged.resolve().is_relative_to(job_root) else self._tree_bytes(staged)
        with self.write_admission(job_root, additional):
            if destination.exists():
                raise FileExistsError(destination)
            destination.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staged, destination)
        return destination
