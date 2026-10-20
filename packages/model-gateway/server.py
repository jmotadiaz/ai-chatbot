"""Model Gateway — wrapper FastAPI sobre LiteLLM Proxy (stateless, sin DB).

Expone `GET /v1/models/catalog` (catálogo filtrado en servidor, ver spec §2.2)
y monta la app del proxy de LiteLLM por debajo, de modo que el resto de rutas
de operación (`/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`,
`/v1/audio/speech`, `/v1/decisions`, `/v1/systemone`) las sirve LiteLLM
nativamente. `decision-default` no necesita passthrough manual (spec §2.3).

Los imports de fastapi/litellm viven DENTRO de `create_app()` para que la
lógica pura del catálogo (`catalog.py`) y sus tests no los necesiten.

Arranque: `uvicorn server:app --host 127.0.0.1 --port 4000`
(vía `scripts/run-gateway.sh`, que inyecta las credenciales de systemd-creds
como variables de entorno).
"""

from __future__ import annotations

import os
from pathlib import Path

from catalog import CONFIG_PATH, authorize, build_catalog, load_config

# El consumidor autentica con `Authorization: Bearer $MODEL_GATEWAY_API_KEY`;
# la misma variable alimenta el master_key de LiteLLM en config.yaml.
API_KEY_ENV = "MODEL_GATEWAY_API_KEY"


def create_app(config_path: str | Path = CONFIG_PATH):
    """Fábrica de la app (imports pesados aquí dentro)."""
    from fastapi import HTTPException, Request

    import litellm.proxy.proxy_server as proxy_server
    from fastapi import FastAPI

    config = load_config(config_path)
    app = FastAPI(title="model-gateway", docs_url=None, redoc_url=None)

    @app.get("/v1/models/catalog")
    async def models_catalog(request: Request, include_internal: bool = False):
        expected_key = os.environ.get(API_KEY_ENV)
        if not authorize(request.headers.get("authorization"), expected_key):
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        return build_catalog(config, include_internal=include_internal)

    # La app del proxy de LiteLLM sirve el resto de rutas de operación. Las
    # rutas propias registradas arriba tienen prioridad sobre el mount "/":
    # FastAPI evalúa primero las rutas exactas y después los mounts.
    app.mount("/", proxy_server.app)
    return app


# Entrypoint de uvicorn (`uvicorn server:app`).
app = create_app()
