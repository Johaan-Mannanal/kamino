from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Event
from uuid import UUID

from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.contracts import JobError, ReconstructionProgress
from photo2sim.integrations.reconstruction import ProviderError, ReconstructionProvider


class JobWorker:
    def __init__(self, store: JobStore, provider: ReconstructionProvider, settings: Settings):
        self.store = store
        self.provider = provider
        self.settings = settings
        self.stopping = Event()
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="reconstruction")

    def start(self):
        for job in self.store.active():
            if job.status in ("preparing", "validating"):
                self.fail(
                    job.id,
                    "processing_interrupted",
                    "Simulation processing was interrupted. Artifacts are retained; retry processing.",
                )
            else:
                self.enqueue(job.id)

    def enqueue(self, job_id: UUID):
        self.executor.submit(self.run, job_id)

    def enqueue_processing(self, job_id: UUID):
        self.executor.submit(self.run_processing, job_id)

    def run_processing(self, job_id: UUID):
        if self.stopping.is_set():
            return
        try:
            from photo2sim.api.pipeline import process_job
        except ImportError:
            self.fail(
                job_id,
                "simulation_unavailable",
                "Install the project simulation extra, restart the server, and retry processing.",
            )
            return
        process_job(self.store, job_id)

    def close(self):
        self.stopping.set()
        self.executor.shutdown(wait=True, cancel_futures=True)

    def fail(self, job_id: UUID, code: str, message: str):
        self.store.update(job_id, status="failed", error=JobError(code=code, message=message))

    def run(self, job_id: UUID):
        try:
            job = self.store.get(job_id)
            if self.stopping.is_set():
                return
            if job.provider != self.provider.name:
                self.fail(job_id, "provider_mismatch", "Restart with the original job provider.")
                return
            if job.status == "reconstructing" and not job.provider_task_id:
                self.fail(
                    job_id,
                    "submission_uncertain",
                    "Submission may have reached the provider. Inspect its dashboard before retrying.",
                )
                return
            if not job.provider_task_id:
                self.store.update(
                    job_id,
                    status="reconstructing",
                    reconstruction_progress=ReconstructionProgress(
                        stage="submitting", stage_started_at=datetime.now(UTC)
                    ),
                )
                paths = [self.store.job_dir(job_id) / path for path in job.source_images]
                task_id = self.provider.submit(paths)
                job = self.store.update(job_id, provider_task_id=task_id)
            else:
                job = self.store.update(job_id, status="reconstructing")
            for _ in range(self.settings.max_polls):
                if self.stopping.is_set():
                    return
                snapshot = self.provider.poll(job.provider_task_id)
                if snapshot.status == "failed":
                    raise ProviderError(
                        "provider_failed", "Reconstruction failed. Inspect the provider task."
                    )
                now = datetime.now(UTC)
                stage = {"pending": "queued", "running": "processing", "succeeded": "downloading"}[
                    snapshot.status
                ]
                previous = job.reconstruction_progress
                # Keep the legacy overall high-water mark monotonic, but preserve the
                # latest raw reading separately (including missing/regressive values).
                reported = snapshot.progress
                high_water = (
                    max(job.progress, min(99, reported)) if reported is not None else job.progress
                )
                job = self.store.update(
                    job_id,
                    progress=min(99, high_water),
                    reconstruction_progress=ReconstructionProgress(
                        stage=stage,
                        stage_started_at=(
                            previous.stage_started_at
                            if previous and previous.stage == stage
                            else now
                        ),
                        provider_progress=reported,
                        last_advanced_at=(
                            now
                            if reported is not None and reported > job.progress
                            else previous.last_advanced_at
                            if previous
                            else None
                        ),
                    ),
                )
                if snapshot.status == "succeeded":
                    root = self.store.job_dir(job_id)
                    mesh = self.provider.download(snapshot, root / "reconstruction")
                    relative = mesh.resolve().relative_to(root.resolve()).as_posix()
                    self.store.update(
                        job_id,
                        status="awaiting_properties",
                        progress=100,
                        mesh_path=relative,
                        reconstruction_progress=job.reconstruction_progress.model_copy(
                            update={"stage": "ready", "stage_started_at": datetime.now(UTC)}
                        ),
                    )
                    return
                if self.stopping.wait(self.settings.poll_interval):
                    return
            raise ProviderError(
                "provider_timeout",
                "Polling limit reached. The saved provider task may still finish.",
            )
        except ProviderError as error:
            self.fail(job_id, error.code, error.message)
        except Exception:
            # Raw SDK/HTTP exceptions can contain keys or signed asset URLs.
            self.fail(
                job_id,
                "reconstruction_error",
                "Reconstruction could not finish. Saved inputs and task ID are retained.",
            )
