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

# 2) Despliegue + unidad systemd (copia a /opt/model-gateway, crea el venv,
#    instala, habilita, arranca en :4000 y verifica)
pnpm run deploy

# 3) Arranque manual desde el repo (sin systemd): crea un venv local y exporta
#    las 7 vars a mano (o usa un CREDENTIALS_DIRECTORY falso)
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -e .
.venv/bin/uvicorn server:app --host 127.0.0.1 --port 4000
```

## Redesplegar

```bash
cd packages/model-gateway
pnpm run deploy              # = bash scripts/deploy.sh
```

> Usa `pnpm run deploy`, no `pnpm deploy` a secas: `deploy` es también un
> comando nativo de pnpm y el enrutado de argumentos se vuelve confuso.

`scripts/deploy.sh` es el **único** camino de despliegue (primera instalación y
redeploys) y es idempotente:

1. **Precondiciones**: los 7 `.cred` presentes, `uv` en el PATH y el árbol de
   `packages/model-gateway` sin cambios sin commitear (si los hay, aborta para
   que lo desplegado sea identificable; `--allow-dirty` lo permite y queda
   estampado).
2. **Fuente**: el checkout actual, o una revisión concreta con
   `--ref <commit|tag>` (`git archive`, no toca el worktree).
3. **Dependencias primero**: solo `pyproject.toml` viaja a `/opt/model-gateway`
   y se resuelven las deps en el venv. Si esto falla, el servicio sigue
   corriendo el artefacto anterior **intacto**.
4. **Artefacto**: `server.py`, `catalog.py`, `config.yaml`, `CONTRACT.md`,
   `README.md` y `scripts/run-gateway.sh` a `/opt/model-gateway`, más un
   `DEPLOYED` con `commit`, `branch`, `deployed_at` y `dirty` (también se
   imprime al arrancar, así que `journalctl -u model-gateway` dice qué versión
   corre).
5. **Unidad** + `daemon-reload` + `restart` (o `enable --now` la primera vez).
6. **Health check**: `GET /v1/models/catalog` sin bearer debe dar `401` (app
   viva y auth enforced); con `MODEL_GATEWAY_API_KEY` exportada en el entorno,
   además exige modelos en el catálogo. Si falla, imprime el journal y el
   comando exacto para volver a la revisión anterior.

### Volver atrás

No hay backups: el artefacto se regenera desde git.

```bash
pnpm run deploy -- --ref <sha-anterior>
```

El sha de lo que está corriendo vive en `/opt/model-gateway/DEPLOYED` (y en el
journal). Si el health check falla, el propio script te lo imprime.

### Qué NO hay que reiniciar

El chatbot y el worker no necesitan reinicio tras un redeploy del gateway: el
catálogo del chatbot tiene TTL de 60 s y el worker lo consulta al arrancar. Sí
hay que relanzar `pnpm run deploy` tras editar `config.yaml` (los modelos y
contratos viven ahí, no en el proceso).

### Primera instalación

`pnpm run deploy` también sirve para la primera vez: si no hay credenciales,
aborta antes de tocar nada y te dice qué ejecutar (`scripts/manage-creds.sh`).
No hay un script de instalación aparte a propósito: dos caminos con la misma
lógica acaban divergiendo.

### Por qué `DynamicUser=yes`

La unidad corre con un **UID transitorio** (systemd lo asigna en cada arranque)
precisamente para que `$CREDENTIALS_DIRECTORY` no sea legible por otros
procesos del host que compartan el usuario del operador — incluidos los agentes
de código. Las consecuencias, ya resueltas en la unidad:

- El proceso **no puede leer `/home/<operador>`** → de ahí el despliegue a
  `/opt/model-gateway` y `ProtectHome=yes`.
- `HOME` y los directorios de escritura son `StateDirectory`/`CacheDirectory`
  (`/var/lib/model-gateway`, `/var/cache/model-gateway`), creados ya con el UID
  transitorio como dueño.
- `PYTHONDONTWRITEBYTECODE=1`, para no intentar escribir `__pycache__` en el
  artefacto read-only.
- `CONFIG_FILE_PATH=/opt/model-gateway/config.yaml`: LiteLLM lee el YAML de esa
  variable; sin ella el proxy arrancaría sin `model_list` ni `master_key`.

Nada de esto impide que **root** lea las credenciales desencriptadas mientras el
servicio corre: la garantía es frente a otros procesos no privilegiados del
mismo usuario, no frente a un compromiso del host.

## Cómo se cargan las credenciales

Las 7 API keys (la propia `model_gateway_api_key` + 6 proveedores) viven
cifradas con `systemd-creds encrypt` en `/etc/model-gateway/creds/*.cred`
(gestor: `scripts/manage-creds.sh`). La unidad systemd las desencripta a
`$CREDENTIALS_DIRECTORY` vía `LoadCredentialEncrypted=` y
`scripts/run-gateway.sh` exporta cada fichero a su variable de entorno en
MAYÚSCULAS (`model_gateway_api_key` → `MODEL_GATEWAY_API_KEY`) en el arranque
del proceso: las claves solo existen en memoria del servicio, nunca en disco
plano ni en `.env`. El directorio del UID transitorio es `0500` y propiedad del
propio servicio, por lo que un `cat` desde otra sesión del operador falla con
*permission denied*.

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
