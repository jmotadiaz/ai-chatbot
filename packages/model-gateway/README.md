# Model Gateway

Machine service that custodies all AI provider API keys and serves the
**Model Catalog** to its consumers (`chatbot`, `coding-agent`).
LiteLLM Proxy in **100% stateless** mode (`config.yaml` as the single source of
truth, no database), wrapped in a FastAPI micro-entrypoint
(`server.py`), deployed as a systemd unit on `127.0.0.1:4000`.

## What it exposes

- `GET /v1/models/catalog` — normalized catalog (`{"models": [...]}`),
  authenticated with `Authorization: Bearer $MODEL_GATEWAY_API_KEY`. Filters **on
  the server**: only models with `user_invocable: true` come out (the 10
  `*-default` contracts stay hidden unless `?include_internal=true`). It never
  exposes `litellm_params`.
- `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech`,
  `/v1/decisions`, `/v1/systemone` — served natively by LiteLLM
  (mounted under FastAPI in `server.py`), authenticated with the same bearer
  (`master_key` in `config.yaml`).

## Model aliases (stable names)

Besides the canonical ids, the Gateway accepts family/tier aliases that do not
change between model versions (`router_settings.model_group_alias`; see
`CONTRACT.md` and spec §2.6):

| Alias | Canonical model |
| :--- | :--- |
| `deepseek-flash` | `Deepseek v4.1 Flash` |
| `glm-flash` | `GLM 5.3 Flash` |
| `glm-pro` | `GLM 5.3` |
| `mimo-flash` | `MiMo V2.6 Flash` |
| `mimo-pro` | `MiMo V2.6 Pro` |
| `meta-muse-spark` | `Muse Spark 1.3` |
| `free` | `Beam Free` |

- They are accepted as `model` in `/v1/chat/completions` and the rest of the LiteLLM
  routes, but **do not** appear in `GET /v1/models/catalog` (nor in the picker);
  `hidden: true` also excludes them from the native `/v1/models`.
- A version bump is done by re-pointing the alias in `config.yaml`: the
  consumers that invoke the alias do not change.
- There is no `deepseek-pro`: the Gateway does not declare a Pro tier for Deepseek
  (only `deepseek-v4.1-flash`).

## How to start it

```bash
# 1) Credentials (interactive wizard; writes to /etc/model-gateway/creds/*.cred)
pnpm creds:list
bash scripts/manage-creds.sh        # setup: the 7 credentials, one by one
bash scripts/manage-creds.sh set openrouter_api_key

# 2) Deployment + systemd unit (copies to /opt/model-gateway, creates the venv,
#    installs, enables, starts on :4000 and verifies)
pnpm run deploy

# 3) Manual start from the repo (no systemd): creates a local venv and exports
#    the 7 vars by hand (or uses a fake CREDENTIALS_DIRECTORY)
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -e .
.venv/bin/uvicorn server:app --host 127.0.0.1 --port 4000
```

## Redeploy

```bash
cd packages/model-gateway
pnpm run deploy              # = bash scripts/deploy.sh
```

> Use `pnpm run deploy`, not bare `pnpm deploy`: `deploy` is also a
> native pnpm command and the argument routing gets confusing.

`scripts/deploy.sh` is the **only** deployment path (first install and
redeploys) and it is idempotent:

1. **Preconditions**: the 7 `.cred` files present, `uv` on the PATH and the
   `packages/model-gateway` tree without uncommitted changes. If the tree is
   dirty, it **does not abort**: it warns, lists the changes and asks "Deploy
   anyway? [y/N]"; with `y` it continues and with `n` (or no answer) it cancels
   before touching anything. `--allow-dirty` skips the warning and the question
   entirely (it deploys and stamps it as `dirty=yes`).
2. **Source**: the current checkout, or a specific revision with
   `--ref <commit|tag>` (`git archive`, does not touch the worktree). With `--ref`
   the artifact comes from the committed revision, so the worktree does not take
   part and there is no dirty-tree guard (a rollback is not blocked by local
   uncommitted changes).
3. **Dependencies first**: only `pyproject.toml` travels to `/opt/model-gateway`
   and the deps are resolved in the venv. If this fails, the service keeps
   running the previous artifact **intact**.
4. **Artifact**: `server.py`, `catalog.py`, `config.yaml`, `CONTRACT.md`,
   `README.md` and `scripts/run-gateway.sh` to `/opt/model-gateway`, plus a
   `DEPLOYED` with `commit`, `branch`, `deployed_at` and `dirty` (it is also
   printed on startup, so `journalctl -u model-gateway` says which version is
   running).
5. **Unit** + `daemon-reload` + `restart` (or `enable --now` the first time).
6. **Health check**: `GET /v1/models/catalog` without a bearer must return `401`
   (app alive and auth enforced); with `MODEL_GATEWAY_API_KEY` exported in the
   environment, it also requires models in the catalog. If it fails, it prints the
   journal and the exact command to go back to the previous revision.

### Rolling back

There are no backups: the artifact is regenerated from git.

```bash
pnpm run deploy -- --ref <previous-sha>
```

The sha of what is running lives in `/opt/model-gateway/DEPLOYED` (and in the
journal). If the health check fails, the script itself prints it for you.

### What NOT to restart

The chatbot and the worker do not need a restart after a gateway redeploy: the
chatbot catalog has a 60 s TTL and the worker queries it on startup. You DO
have to run `pnpm run deploy` again after editing `config.yaml` (the models and
contracts live there, not in the process).

### First installation

`pnpm run deploy` also works for the first time: if there are no credentials,
it aborts before touching anything and tells you what to run
(`scripts/manage-creds.sh`).
There is no separate install script on purpose: two paths with the same
logic end up diverging.

### Why `DynamicUser=yes`

The unit runs with a **transient UID** (systemd assigns it on every boot)
precisely so that `$CREDENTIALS_DIRECTORY` is not readable by other host
processes that share the operator's user — including coding
agents. The consequences, already handled in the unit:

- The process **cannot read `/home/<operator>`** → hence the deployment to
  `/opt/model-gateway` and `ProtectHome=yes`.
- `HOME` and the writable directories are `StateDirectory`/`CacheDirectory`
  (`/var/lib/model-gateway`, `/var/cache/model-gateway`), created already with the
  transient UID as owner.
- `PYTHONDONTWRITEBYTECODE=1`, so it never tries to write `__pycache__` into the
  read-only artifact.
- `CONFIG_FILE_PATH=/opt/model-gateway/config.yaml`: LiteLLM reads the YAML from that
  variable; without it the proxy would start without `model_list` or `master_key`.

None of this prevents **root** from reading the decrypted credentials while the
service runs: the guarantee is against other unprivileged processes of the
same user, not against a host compromise.

## How credentials are loaded

The 7 API keys (the `model_gateway_api_key` itself + 6 providers) live
encrypted with `systemd-creds encrypt` in `/etc/model-gateway/creds/*.cred`
(manager: `scripts/manage-creds.sh`). The systemd unit decrypts them into
`$CREDENTIALS_DIRECTORY` via `LoadCredentialEncrypted=` and
`scripts/run-gateway.sh` exports each file to its environment variable in
UPPERCASE (`model_gateway_api_key` → `MODEL_GATEWAY_API_KEY`) at process
startup: the keys only exist in the service's memory, never on plain disk nor
in `.env`. The transient UID's directory is `0500` and owned by the service
itself, so a `cat` from another operator session fails with
*permission denied*.

## Why there is no DB

The Gateway is stateless on purpose (ADR 0010): `config.yaml` is the only
source of truth for models, contracts and metadata. There are no virtual keys,
no spend tracking, no session state: it authenticates by shared bearer and
routes to the upstream. Without a DB there is no state to migrate, back up or
sync between Environments, and the service can be recreated from the repo in
seconds.

## Tests

```bash
python3 -m pytest packages/model-gateway/tests -q   # from the repo root
```

The pure logic (catalog, filtering, authorization) lives in `catalog.py`,
importable without `litellm`/`fastapi`; `server.py` does the heavy imports
inside `create_app()`.
