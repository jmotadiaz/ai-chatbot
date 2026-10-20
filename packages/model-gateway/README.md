# Model Gateway

Servicio de la máquina que custodia todas las API keys de proveedores de IA y
sirve el **Model Catalog** a sus consumidores (`chatbot`, `coding-agent`).
LiteLLM Proxy en modo **100% stateless** (`config.yaml` como única fuente de
verdad, sin base de datos), envuelto en un micro-entrypoint FastAPI
(`server.py`), desplegado como unidad systemd en `127.0.0.1:4000`.

## Qué expone

- `GET /v1/models/catalog` — catálogo normalizado (`{"models": [...]}`),
  autenticado con `Authorization: Bearer $MODEL_GATEWAY_API_KEY`. Filtra **en
  servidor**: solo salen los modelos `user_invocable: true` (los 10 contratos
  `*-default` quedan ocultos salvo `?include_internal=true`). Nunca expone
  `litellm_params`.
- `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech`,
  `/v1/decisions`, `/v1/systemone` — servidos nativamente por LiteLLM
  (montado bajo FastAPI en `server.py`), autenticados con el mismo bearer
  (`master_key` en `config.yaml`).

## Cómo arrancarlo

```bash
# 1) Credenciales (wizard interactivo; escribe en /etc/model-gateway/creds/*.cred)
pnpm creds:list
bash scripts/manage-creds.sh        # setup: las 7 credenciales, una a una
bash scripts/manage-creds.sh set openrouter_api_key

# 2) Unidad systemd (instala, habilita y arranca en :4000)
pnpm systemd:install

# 3) Arranque manual (sin systemd; requiere las vars ya en el entorno)
uvicorn server:app --host 127.0.0.1 --port 4000
```

## Cómo se cargan las credenciales

Las 7 API keys (la propia `model_gateway_api_key` + 6 proveedores) viven
cifradas con `systemd-creds encrypt` en `/etc/model-gateway/creds/*.cred`
(gestor: `scripts/manage-creds.sh`). La unidad systemd las desencripta a
`$CREDENTIALS_DIRECTORY` vía `LoadCredentialEncrypted=` y
`scripts/run-gateway.sh` exporta cada fichero a su variable de entorno en
MAYÚSCULAS (`model_gateway_api_key` → `MODEL_GATEWAY_API_KEY`) en el arranque
del proceso: las claves solo existen en memoria del servicio, nunca en disco
plano ni en `.env`.

## Por qué no hay DB

El Gateway es stateless a propósito (ADR 0010): `config.yaml` es la única
fuente de verdad de modelos, contratos y metadatos. No hay virtual keys, ni
spend tracking, ni estado de sesiones: autentica por bearer compartido y enruta
al upstream. Sin DB no hay estado que migrar, respaldar ni sincronizar entre
entornos, y el servicio se puede recrear desde el repo en segundos.

## Tests

```bash
python3 -m pytest packages/model-gateway/tests -q   # desde la raíz del repo
```

La lógica pura (catálogo, filtrado, autorización) vive en `catalog.py`,
importable sin `litellm`/`fastapi`; `server.py` hace los imports pesados
dentro de `create_app()`.
