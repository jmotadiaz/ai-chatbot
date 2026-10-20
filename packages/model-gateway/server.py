"""Model Gateway — LiteLLM Proxy stateless (sin DB) + endpoint del catálogo.

La app que sirve uvicorn ES la app del proxy de LiteLLM (`proxy_server.app`),
no un wrapper que la monta: el `model_list` y el `master_key` los carga
LiteLLM en el LIFESPAN de su propia app, y los lifespan de las sub-apps
montadas no se ejecutan — montándola debajo, el router arrancaba vacío
("Invalid model name" en /v1/chat/completions aunque /v1/models/catalog
respondiera, porque ese lo lee catalog.py del YAML).

OJO: aquí no va `from __future__ import annotations`. Las anotaciones de las
rutas se resuelven contra los globals del módulo, y `Request` se importa
dentro de `create_app` (imports pesados diferidos): con el future-import la
anotación llegaba como texto sin resolver y FastAPI trataba `request` como
query param obligatorio → 422 en todas las peticiones.

Sobre la app de LiteLLM se registra `GET /v1/models/catalog` (autenticado,
filtrado en servidor, ver spec §2.2). El resto de rutas de operación
(`/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech`,
`/v1/decisions`, `/v1/systemone`) las sirve LiteLLM nativamente; `decision-default`
no necesita passthrough manual (spec §2.3).

Arranque: `uvicorn server:app --host 127.0.0.1 --port 4000`
(vía `scripts/run-gateway.sh`, que inyecta las credenciales de systemd-creds
como variables de entorno).
"""

import os
import uuid
from pathlib import Path

from catalog import (
    CONFIG_PATH,
    authorize,
    build_catalog,
    load_config,
    prepare_opencode_deployment_kwargs,
)

# El consumidor autentica con `Authorization: Bearer $MODEL_GATEWAY_API_KEY`;
# la misma variable alimenta el master_key de LiteLLM en config.yaml.
API_KEY_ENV = "MODEL_GATEWAY_API_KEY"

# OpenCode Go exige identificar cada request con una sesión estable por proceso
# (https://opencode.ai/docs/go/#where-can-i-use-it) para routing y prompt caching.
OPENCODE_SESSION_ID = str(uuid.uuid4())


def create_app(config_path: str | Path = CONFIG_PATH):
    """Fábrica de la app (imports pesados aquí dentro)."""
    from fastapi import HTTPException, Request

    import litellm
    from litellm.integrations.custom_logger import CustomLogger
    import litellm.proxy.proxy_server as proxy_server

    class _OpenCodeDeploymentHook(CustomLogger):
        async def async_pre_call_deployment_hook(self, kwargs, call_type):
            return prepare_opencode_deployment_kwargs(kwargs, OPENCODE_SESSION_ID)

    if not any(
        getattr(cb, "_is_opencode_deployment_hook", False)
        for cb in litellm.callbacks
    ):
        hook = _OpenCodeDeploymentHook()
        hook._is_opencode_deployment_hook = True
        litellm.callbacks.append(hook)

    app = proxy_server.app
    config = load_config(config_path)

    @app.get("/v1/models/catalog")
    async def models_catalog(request: Request, include_internal: bool = False):
        expected_key = os.environ.get(API_KEY_ENV)
        if not authorize(request.headers.get("authorization"), expected_key):
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        return build_catalog(config, include_internal=include_internal)

    # Que la nuestra despache antes que cualquier ruta dinámica de LiteLLM
    # (Starlette despacha en orden de registro; la nuestra acaba de quedar última).
    app.router.routes.insert(0, app.router.routes.pop())
    return app


# Entrypoint de uvicorn (`uvicorn server:app`).
app = create_app()
