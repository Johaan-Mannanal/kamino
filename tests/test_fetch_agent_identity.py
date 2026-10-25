from unittest.mock import patch

import pytest

from photo2sim.integrations.fetch_agent.identity import configured_seed, initialize, load_seed


def test_canonical_legacy_and_conflicting_names():
    private = "test-only-private-seed-value-at-least-32-characters"
    assert configured_seed({"FETCH_AGENT_SEED": private}) == private
    assert configured_seed({"AGENT_SEED_PHRASE": private}) == private
    with pytest.raises(ValueError, match="disagree"):
        configured_seed({"FETCH_AGENT_SEED": private, "AGENT_SEED_PHRASE": "different"})


def test_identity_is_created_once_and_never_overwritten(tmp_path):
    path = tmp_path / "identity.seed"
    with patch("photo2sim.integrations.fetch_agent.identity.secure_file"):
        first = initialize(path, {})
        assert len(first) >= 32
        assert initialize(path, {}) == first
        assert load_seed({}, path) == first
        with pytest.raises(ValueError, match="differs"):
            initialize(
                path, {"FETCH_AGENT_SEED": "different-private-identity-at-least-32-characters"}
            )
        assert path.read_text().strip() == first
