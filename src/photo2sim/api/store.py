import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from photo2sim.contracts import JobRecord


class JobConflict(ValueError):
    """Another operation has already moved this job to a different stage."""


class JobStore:
    """Each operation owns its connection, including transactions between threads."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir.resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.database = self.data_dir / "jobs.sqlite3"
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, record TEXT)")

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.database, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def create(self, job: JobRecord):
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO jobs (id, record) VALUES (?, ?)", (str(job.id), job.model_dump_json())
            )

    def get(self, job_id: UUID) -> JobRecord:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT record FROM jobs WHERE id = ?", (str(job_id),)
            ).fetchone()
        if row is None:
            raise KeyError(str(job_id))
        return JobRecord.model_validate_json(row[0])

    def update(self, job_id: UUID, *, expected_status: tuple[str, ...] | None = None, **changes):
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT record FROM jobs WHERE id = ?", (str(job_id),)
            ).fetchone()
            if row is None:
                raise KeyError(str(job_id))
            values = JobRecord.model_validate_json(row[0]).model_dump()
            if expected_status is not None and values["status"] not in expected_status:
                raise JobConflict("Job stage changed; reload its current status")
            values.update(changes, updated_at=datetime.now(UTC))
            result = JobRecord.model_validate(values)
            connection.execute(
                "UPDATE jobs SET record = ? WHERE id = ?", (result.model_dump_json(), str(job_id))
            )
        return result

    def active(self) -> list[JobRecord]:
        with self.connect() as connection:
            rows = connection.execute("SELECT record FROM jobs").fetchall()
        records = [JobRecord.model_validate_json(row[0]) for row in rows]
        return [
            job
            for job in records
            if job.status in ("queued", "reconstructing", "preparing", "validating")
        ]

    def job_dir(self, job_id: UUID) -> Path:
        return self.data_dir / str(job_id)
