from photo2sim.api.config import Settings


def clear_settings(monkeypatch):
    for name in (
        "PHOTO2SIM_PROVIDER",
        "PHOTO2SIM_DATA_DIR",
        "MESHY_API_KEY",
        "MESHY_MODEL",
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "PHOTO2SIM_API_TOKEN",
        "PHOTO2SIM_CORS_ORIGINS",
    ):
        monkeypatch.delenv(name, raising=False)


def test_local_env_supplies_provider_keys_and_model_without_mutating_process(tmp_path, monkeypatch):
    import os

    clear_settings(monkeypatch)
    env_file = tmp_path / ".env"
    env_file.write_text(
        'PHOTO2SIM_PROVIDER=meshy\nMESHY_API_KEY="local-meshy-secret"\n'
        'GEMINI_API_KEY="local-gemini-secret"\nGEMINI_MODEL=test-flash\n'
    )
    result = Settings.from_env(env_file=env_file)
    assert result.provider == "meshy"
    assert result.meshy_api_key == "local-meshy-secret"
    assert result.gemini_api_key == "local-gemini-secret"
    assert result.gemini_model == "test-flash"
    assert "local-meshy-secret" not in repr(result)
    assert "local-gemini-secret" not in repr(result)
    assert "MESHY_API_KEY" not in os.environ


def test_shell_environment_takes_precedence_over_local_config(tmp_path, monkeypatch):
    clear_settings(monkeypatch)
    env_file = tmp_path / ".env"
    env_file.write_text("PHOTO2SIM_PROVIDER=mock\nGEMINI_MODEL=from-file\n")
    monkeypatch.setenv("GEMINI_MODEL", "from-shell")
    result = Settings.from_env(env_file=env_file)
    assert result.gemini_model == "from-shell"


def test_no_config_file_still_runs_without_external_credentials(tmp_path, monkeypatch):
    clear_settings(monkeypatch)
    result = Settings.from_env(env_file=tmp_path / "absent.env")
    assert result.provider == "mock"
    assert result.meshy_api_key == ""
    assert result.gemini_api_key == ""


def test_deployment_access_and_origins_load_without_exposing_token(tmp_path, monkeypatch):
    clear_settings(monkeypatch)
    env = tmp_path / ".env"
    env.write_text(
        "PHOTO2SIM_API_TOKEN=private-team-token\nPHOTO2SIM_CORS_ORIGINS=https://demo.example.com,http://localhost:5173\n"
    )
    result = Settings.from_env(env_file=env)
    assert result.api_token == "private-team-token"
    assert result.cors_origins == ("https://demo.example.com", "http://localhost:5173")
    assert "private-team-token" not in repr(result)
