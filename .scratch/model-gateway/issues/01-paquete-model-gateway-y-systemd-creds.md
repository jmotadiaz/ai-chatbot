# 01: Paquete `packages/model-gateway` (LiteLLM stateless + FastAPI `/v1/models/catalog` + `systemd-creds`)

**What to build:** Un paquete autónomo en `packages/model-gateway` (sin ninguna dependencia del workspace de pnpm para que pueda moverse en el futuro a su propio repositorio con `mv` + `git init`) que ejecuta LiteLLM Proxy en modo 100% stateless (`config.yaml`, sin base de datos), envuelto por un entrypoint FastAPI (`server.py`) que filtra en servidor el catálogo de modelos para los consumidores, acompañado de su unidad `systemd` y el wizard interactivo de credenciales con `systemd-creds`.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `packages/model-gateway/config.yaml` declara únicamente los **14 modelos `user_invocable: true` activos** (con sus metadatos completos en `model_info`: `user_invocable: true`, `is_default`, `company`, `context_window`, `max_output_tokens`, costes, `reasoning`, `thinking_levels`, `default_thinking_level`, `supported_files`, `supported_output`, `zero_data_retention`, `default_temperature`, `default_top_p`, `default_top_k`) y los **10 `Default Model Contracts` (`user_invocable: false`)**:
  - `fast-default` $\rightarrow$ `GPT OSS Mini` (`openai/gpt-oss-20b` vía Vercel AI Gateway con `order: ["groq"]`, ZDR)
  - `flash-default` $\rightarrow$ `Gemini 3.1 Flash Lite` (`google/gemini-3.1-flash-lite` vía Vercel AI Gateway con reasoning `minimal`, ZDR)
  - `vision-default` $\rightarrow$ `MiMo V2.6 Flash` (`mimo-v2.6-flash` vía OpenCode Go, `img` + `pdf`)
  - `reasoning-default` $\rightarrow$ `Deepseek v4.1 Flash` (`deepseek-v4.1-flash` vía OpenCode Go con reasoning `max`, ZDR)
  - `free-default` $\rightarrow$ `Nemotron 3 Super` (`nvidia/nemotron-3-super-120b-a12b:free` vía OpenRouter)
  - `image-default` $\rightarrow$ `Nano Banana` (`google/gemini-2.5-flash-image` vía OpenRouter)
  - `embedding-default` $\rightarrow$ `Gemini Embedding 001` (`gemini-embedding-001` vía Google, 768d)
  - `rerank-default` $\rightarrow$ `Cohere Rerank v4 Pro` (`rerank-v4.0-pro` vía Cohere)
  - `decision-default` $\rightarrow$ `Jev 1.13` (`typesafe/jev-1.13` vía OpenRouter, servido por la ruta nativa `/v1/decisions` y `/v1/systemone` de LiteLLM)
  - `tts-default` $\rightarrow$ `GPT-4o Mini TTS` (`gpt-4o-mini-tts-2025-03-20` vía OpenAI `/v1/audio/speech`)
- [x] `packages/model-gateway/server.py` envuelve la aplicación FastAPI de LiteLLM y expone `GET /v1/models/catalog` (autenticado con `MODEL_GATEWAY_API_KEY`), filtrando **en el servidor** los modelos con `model_info.user_invocable === true` (ocultando los 10 `*-default` salvo que se pase `?include_internal=true`) y devolviendo el esquema limpio `{ models: [...] }` sin exponer `litellm_params`.
- [x] `packages/model-gateway/scripts/manage-creds.sh` implementa un modo interactivo por defecto (`setup`) que recorre en bucle las **7 credenciales requeridas** (`model_gateway_api_key`, `opencode_api_key`, `ai_gateway_api_key`, `openrouter_api_key`, `google_generative_ai_api_key`, `cohere_api_key`, `openai_api_key`), pide su valor una a una en silencio y ejecuta `sudo systemd-creds encrypt --name=<key> - /etc/model-gateway/creds/<key>.cred` sobrescribiendo siempre si ya existe (además de subcomandos `set <key>` y `list`).
- [x] `packages/model-gateway/systemd/model-gateway.service` define la unidad de sistema con `LoadCredentialEncrypted=` para las 7 credenciales, y `scripts/run-gateway.sh` carga los ficheros de `$CREDENTIALS_DIRECTORY` a variables de entorno efímeras del proceso antes de arrancar `uvicorn` en `127.0.0.1:4000`.
- [x] Incluye tests automatizados del endpoint `GET /v1/models/catalog` verificando que solo devuelve los 14 modelos `user_invocable: true` con su esquema normalizado y que ningún contrato `*-default` se filtra al catálogo de usuario.

## Comments

## Result

Hecho tal cual: `config.yaml` con los 14 user-invocable + 10 contratos, `server.py` (FastAPI + `GET /v1/models/catalog` filtrado en servidor), `manage-creds.sh` (setup/set/list), unidad systemd con `LoadCredentialEncrypted=` y tests de pytest (15). El schema del catálogo quedó documentado y versionado en `packages/model-gateway/CONTRACT.md`.

## Follow-up (DynamicUser)

La unidad se endureció para que los secretos no sean legibles por otros procesos del usuario del operador: `DynamicUser=yes` + `ProtectHome=yes`, despliegue a `/opt/model-gateway` (`scripts/deploy.sh`: health check y `--ref`; venv gestionado con `uv`) y `CONFIG_FILE_PATH` explícito. Guardado por `tests/test_service_unit.py` (6 asserts sobre la unidad y los scripts).
