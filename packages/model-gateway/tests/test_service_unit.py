"""Guards of the systemd deployment: the unit runs with a transient UID and the
credentials are only readable by the service's process.

It starts nothing and needs no root: it only reads the package files so that an
accidental change (going back to `User=javier`, forgetting `CONFIG_FILE_PATH`,
losing a credential, pointing `ExecStart` at the repo checkout) fails here and
not on the host.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

UNIT_PATH = Path(__file__).resolve().parents[1] / "systemd" / "model-gateway.service"
RUN_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run-gateway.sh"
DEPLOY_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "deploy.sh"

EXPECTED_CREDENTIALS = [
    "model_gateway_api_key",
    "opencode_api_key",
    "ai_gateway_api_key",
    "openrouter_api_key",
    "google_generative_ai_api_key",
    "cohere_api_key",
    "openai_api_key",
]


@pytest.fixture(scope="module")
def unit() -> str:
    return UNIT_PATH.read_text()


def _directives(unit: str) -> dict[str, list[str]]:
    parsed: dict[str, list[str]] = {}
    for line in unit.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("["):
            continue
        key, _, value = line.partition("=")
        parsed.setdefault(key.strip(), []).append(value.strip())
    return parsed


def test_service_runs_with_dynamic_user(unit: str):
    directives = _directives(unit)
    assert directives["DynamicUser"] == ["yes"], (
        "The unit must use DynamicUser so the UID is transient and other "
        "operator processes cannot read $CREDENTIALS_DIRECTORY"
    )
    # An explicit User=/Group= would disable the transient UID.
    assert "User" not in directives
    assert "Group" not in directives


def test_credentials_are_loaded_encrypted_and_complete(unit: str):
    directives = _directives(unit)
    loaded = directives["LoadCredentialEncrypted"]
    assert len(loaded) == len(EXPECTED_CREDENTIALS)
    for key in EXPECTED_CREDENTIALS:
        assert f"{key}:/etc/model-gateway/creds/{key}.cred" in loaded
    # No plaintext LoadCredential=: secrets are only loaded encrypted.
    assert "LoadCredential" not in directives


def test_deployment_artifact_is_outside_the_operator_home(unit: str):
    directives = _directives(unit)
    assert directives["WorkingDirectory"] == ["/opt/model-gateway"]
    assert directives["ProtectHome"] == ["yes"], (
        "With DynamicUser the service cannot read /home; ProtectHome=yes makes "
        "it explicit"
    )
    assert directives["ExecStart"][0].endswith("/opt/model-gateway/scripts/run-gateway.sh")
    # No directive (comments do not count) may point at the operator home.
    assert not [
        f"{key}={value}" for key, values in directives.items() for value in values if "/home/" in value
    ]


def test_litellm_config_path_and_writable_state(unit: str):
    directives = _directives(unit)
    assert "CONFIG_FILE_PATH=/opt/model-gateway/config.yaml" in directives["Environment"], (
        "LiteLLM reads config.yaml from CONFIG_FILE_PATH; without it the proxy "
        "starts without model_list or master_key"
    )
    assert "PYTHONDONTWRITEBYTECODE=1" in directives["Environment"]
    assert directives["StateDirectory"] == ["model-gateway"]
    assert directives["CacheDirectory"] == ["model-gateway"]
    assert any(env.startswith("HOME=%S/model-gateway") for env in directives["Environment"])


def test_run_script_exports_credentials_and_forces_the_config_path():
    script = RUN_SCRIPT.read_text()
    assert "CREDENTIALS_DIRECTORY" in script
    assert "tr '[:lower:]-' '[:upper:]_'" in script
    assert 'export CONFIG_FILE_PATH="${CONFIG_FILE_PATH:-$PWD/config.yaml}"' in script
    # It must use the deployment venv when it exists (systemd PATH does not bring it).
    assert '.venv/bin/uvicorn' in script
    assert re.search(r'exec "\$UVICORN" server:app', script)


def test_deploy_script_deploys_the_artifact_and_builds_the_venv():
    assert DEPLOY_SCRIPT.exists(), "systemd:install must use scripts/deploy.sh"
    script = DEPLOY_SCRIPT.read_text()
    assert 'DEST="/opt/model-gateway"' in script
    assert "venv --python" in script
    assert "config.yaml" in script
    assert "/etc/systemd/system/model-gateway.service" in script
    # Identifiability: stamp with the deployed commit + clean-tree guard.
    assert "DEPLOYED" in script
    assert "--allow-dirty" in script
    # Rollback by revision (no backups: the minimal version has none).
    assert "git archive" in script
    assert "BACKUP_ROOT" not in script and "restore_backup" not in script
    # Real health check (401 without bearer) and no deploying from home.
    assert "wait_http" in script and "401" in script
    assert "protecthome" in script.lower()


def test_dependencies_are_installed_before_the_artifact_is_replaced():
    """If the deps fail, the service must keep running the previous code."""
    script = DEPLOY_SCRIPT.read_text()
    deps = script.index("\ninstall_dependencies\n")
    publish = script.index("\npublish_artifact\n")
    assert deps < publish


def test_package_scripts_point_at_the_deploy_script():
    import json

    scripts = json.loads((Path(__file__).resolve().parents[1] / "package.json").read_text())["scripts"]
    assert scripts["deploy"] == "bash scripts/deploy.sh"
    assert scripts["systemd:install"] == "bash scripts/deploy.sh"

def test_manage_creds_creates_the_creds_dir_with_sudo():
    script = (Path(__file__).resolve().parents[1] / "scripts" / "manage-creds.sh").read_text()
    assert "sudo mkdir -p" in script, (
        "/etc belongs to root: without sudo the wizard dies with Permission denied"
    )
    assert "sudo systemd-creds encrypt" in script
    assert "chmod 600" in script

def test_server_module_keeps_runtime_annotations():
    """With `from __future__ import annotations`, FastAPI does not resolve `Request`
    (it is imported inside create_app) and turns `request` into a mandatory
    query param: 422 on every request. It already happened to us."""
    script = (Path(__file__).resolve().parents[1] / "server.py").read_text()
    assert not any(
        line.strip().startswith("from __future__")
        for line in script.splitlines()
    ), "the annotations must be evaluated at runtime (see server.py docstring)"
