"""Guardas del despliegue systemd: la unidad corre con UID transitorio y las
credenciales solo son legibles por el proceso del servicio.

No arranca nada ni necesita root: solo lee los ficheros del paquete para que
un cambio accidental (volver a `User=javier`, olvidar `CONFIG_FILE_PATH`,
perder una credencial, apuntar `ExecStart` al checkout del repo) falle aquí y
no en el host.
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
        "La unidad debe usar dynamicUser para que el UID sea transitorio y otros "
        "procesos del operador no puedan leer $CREDENTIALS_DIRECTORY"
    )
    # Un User=/Group= explícito desactivaría el UID transitorio.
    assert "User" not in directives
    assert "Group" not in directives


def test_credentials_are_loaded_encrypted_and_complete(unit: str):
    directives = _directives(unit)
    loaded = directives["LoadCredentialEncrypted"]
    assert len(loaded) == len(EXPECTED_CREDENTIALS)
    for key in EXPECTED_CREDENTIALS:
        assert f"{key}:/etc/model-gateway/creds/{key}.cred" in loaded
    # Nada de LoadCredential= en claro: los secretos solo se cargan cifrados.
    assert "LoadCredential" not in directives


def test_deployment_artifact_is_outside_the_operator_home(unit: str):
    directives = _directives(unit)
    assert directives["WorkingDirectory"] == ["/opt/model-gateway"]
    assert directives["ProtectHome"] == ["yes"], (
        "Con DynamicUser el servicio no puede leer /home; ProtectHome=yes lo "
        "deja explícito"
    )
    assert directives["ExecStart"][0].endswith("/opt/model-gateway/scripts/run-gateway.sh")
    # Ninguna directiva (los comentarios no cuentan) puede apuntar al home del operador.
    assert not [
        f"{key}={value}" for key, values in directives.items() for value in values if "/home/" in value
    ]


def test_litellm_config_path_and_writable_state(unit: str):
    directives = _directives(unit)
    assert "CONFIG_FILE_PATH=/opt/model-gateway/config.yaml" in directives["Environment"], (
        "LiteLLM lee config.yaml de CONFIG_FILE_PATH; sin ella el proxy arranca "
        "sin model_list ni master_key"
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
    # Debe usar el venv del despliegue cuando exista (el PATH de systemd no lo trae).
    assert '.venv/bin/uvicorn' in script
    assert re.search(r'exec "\$UVICORN" server:app', script)


def test_deploy_script_deploys_the_artifact_and_builds_the_venv():
    assert DEPLOY_SCRIPT.exists(), "systemd:install debe usar scripts/deploy.sh"
    script = DEPLOY_SCRIPT.read_text()
    assert 'DEST="/opt/model-gateway"' in script
    assert "venv --python" in script
    assert "config.yaml" in script
    assert "/etc/systemd/system/model-gateway.service" in script
    # Identificabilidad: sello con el commit desplegado + guarda de árbol limpio.
    assert "DEPLOYED" in script
    assert "--allow-dirty" in script
    # Rollback por revisión (sin backups: la versión mínima no los tiene).
    assert "git archive" in script
    assert "BACKUP_ROOT" not in script and "restore_backup" not in script
    # Health check real (401 sin bearer) y sin desplegar desde el home.
    assert "wait_http" in script and "401" in script
    assert "protecthome" in script.lower()


def test_dependencies_are_installed_before_the_artifact_is_replaced():
    """Si fallan las deps, el servicio debe seguir corriendo el código anterior."""
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
    assert "sudo mkdir -p" in script, "/etc es de root: sin sudo el wizard muere con Permission denied"
    assert "sudo systemd-creds encrypt" in script
    assert "chmod 600" in script

def test_server_module_keeps_runtime_annotations():
    """Con `from __future__ import annotations`, FastAPI no resuelve `Request`
    (se importa dentro de create_app) y convierte `request` en query param
    obligatorio: 422 en todas las peticiones. Ya nos pasó."""
    script = (Path(__file__).resolve().parents[1] / "server.py").read_text()
    assert not any(
        line.strip().startswith("from __future__")
        for line in script.splitlines()
    ), "las anotaciones deben evaluarse en runtime (ver docstring de server.py)"
