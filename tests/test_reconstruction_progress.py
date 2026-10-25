"""Synthetic provider status sequences; never contact a paid provider."""

from datetime import UTC, datetime
from uuid import uuid4

from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.api.worker import JobWorker
from photo2sim.contracts import JobRecord
from photo2sim.integrations.reconstruction import MockProvider, ProviderSnapshot


def test_provider_milestones_are_truthful_and_overall_progress_never_rewinds(tmp_path):
    store = JobStore(tmp_path)
    now = datetime.now(UTC)
    job_id = uuid4()
    store.create(
        JobRecord(
            id=job_id,
            provider="mock",
            synthetic=True,
            status="queued",
            created_at=now,
            updated_at=now,
        )
    )
    observations = []

    class SequenceProvider(MockProvider):
        submissions = 0
        snapshots = iter(
            [
                ProviderSnapshot(status="pending", progress=None),
                ProviderSnapshot(status="running", progress=1),
                ProviderSnapshot(status="running", progress=1),
                ProviderSnapshot(status="running", progress=40),
                ProviderSnapshot(status="running", progress=12),
                ProviderSnapshot(status="running", progress=None),
                ProviderSnapshot(status="succeeded", progress=100),
            ]
        )

        def submit(self, images):
            self.submissions += 1
            observations.append(store.get(job_id))
            return "one-paid-task"

        def poll(self, task_id):
            observations.append(store.get(job_id))
            return next(self.snapshots)

        def download(self, snapshot, output_dir):
            observations.append(store.get(job_id))
            assert observations[-1].progress == 99
            assert observations[-1].mesh_path is None
            assert observations[-1].reconstruction_progress.stage == "downloading"
            return super().download(snapshot, output_dir)

    provider = SequenceProvider()
    worker = JobWorker(store, provider, Settings(data_dir=tmp_path, poll_interval=0.001))
    try:
        worker.run(job_id)
    finally:
        worker.close()
    result = store.get(job_id)
    assert result.status == "awaiting_properties"
    assert result.progress == 100
    assert result.reconstruction_progress.stage == "ready"
    assert provider.submissions == 1
    assert [job.progress for job in observations] == [0, 0, 0, 1, 1, 40, 40, 40, 99]
    raw = [job.reconstruction_progress.provider_progress for job in observations]
    assert raw == [None, None, None, 1, 1, 40, 12, None, 100]
    # Repeated, regressive, and missing readings cannot reset the last advancement clock.
    assert (
        observations[3].reconstruction_progress.last_advanced_at
        == observations[4].reconstruction_progress.last_advanced_at
    )
    assert (
        observations[5].reconstruction_progress.last_advanced_at
        == observations[7].reconstruction_progress.last_advanced_at
    )


def test_unknown_progress_preserves_poll_limit_and_task_identity(tmp_path):
    store = JobStore(tmp_path)
    now = datetime.now(UTC)
    job_id = uuid4()
    store.create(
        JobRecord(
            id=job_id,
            provider="mock",
            synthetic=True,
            status="reconstructing",
            created_at=now,
            updated_at=now,
            provider_task_id="existing",
        )
    )

    class WaitingProvider(MockProvider):
        polls = 0

        def submit(self, images):
            raise AssertionError("No duplicate task")

        def poll(self, task_id):
            assert task_id == "existing"
            self.polls += 1
            return ProviderSnapshot(status="running", progress=None)

    provider = WaitingProvider()
    worker = JobWorker(
        store, provider, Settings(data_dir=tmp_path, max_polls=2, poll_interval=0.001)
    )
    try:
        worker.run(job_id)
    finally:
        worker.close()
    result = store.get(job_id)
    assert provider.polls == 2
    assert result.error.code == "provider_timeout"
    assert result.provider_task_id == "existing"
    assert result.reconstruction_progress.provider_progress is None
