"""Model Gateway — stateless LiteLLM Proxy (no DB) + catalog endpoint.

The app uvicorn serves IS the LiteLLM proxy app (`proxy_server.app`),
not a wrapper that mounts it: `model_list` and `master_key` are loaded by
LiteLLM in the LIFESPAN of its own app, and the lifespans of mounted sub-apps
do not run — mounting it underneath made the router start empty
("Invalid model name" in /v1/chat/completions even though /v1/models/catalog
answered, because that one is read by catalog.py from the YAML).

CAREFUL: no `from __future__ import annotations` here. The route annotations
are resolved against the module globals, and `Request` is imported inside
`create_app` (deferred heavy imports): with the future-import the annotation
arrived as unresolved text and FastAPI treated `request` as a mandatory
query param → 422 on every request.

On top of the LiteLLM app we register `GET /v1/models/catalog` (authenticated,
filtered on the server, see spec §2.2). The rest of the operation routes
(`/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech`,
`/v1/decisions`, `/v1/systemone`) are served natively by LiteLLM; `decision-default`
needs no manual passthrough (spec §2.3).

Startup: `uvicorn server:app --host 127.0.0.1 --port 4000`
(via `scripts/run-gateway.sh`, which injects the systemd-creds credentials as
environment variables).
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

# The consumer authenticates with `Authorization: Bearer $MODEL_GATEWAY_API_KEY`;
# the same variable feeds the LiteLLM master_key in config.yaml.
API_KEY_ENV = "MODEL_GATEWAY_API_KEY"

# OpenCode Go requires identifying each request with a session that is stable per
# process (https://opencode.ai/docs/go/#where-can-i-use-it) for routing and prompt caching.
OPENCODE_SESSION_ID = str(uuid.uuid4())


def create_app(config_path: str | Path = CONFIG_PATH):
    """App factory (heavy imports in here)."""
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

    # Let ours dispatch before any LiteLLM dynamic route
    # (Starlette dispatches in registration order; ours just ended up last).
    app.router.routes.insert(0, app.router.routes.pop())
    return app


# uvicorn entrypoint (`uvicorn server:app`).
app = create_app()
