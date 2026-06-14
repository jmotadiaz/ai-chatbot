# Coding Agent Integration Design

## 1. Context and Goal

Integrate an autonomous coding agent into the existing AI chatbot application. The agent will use the **Pi SDK** (`@earendil-works/pi-coding-agent`) for reasoning and tool execution, and the **AG-UI protocol** (`@ag-ui/client`) for streaming communication between the frontend and the Next.js backend.

The agent must be able to read, modify, and execute code in a local workspace safely, with session persistence and a design that can evolve toward containerized isolation.

## 2. Key Decisions

| Topic | MVP Decision |
|---|---|
| Isolation | Restricted host process (preparation for future Docker) |
| Entry point | Dedicated views under `/agent/code`, reachable from the sidebar |
| Routes | `/agent/code` → projects, `/agent/code/[project]` → sessions, `/agent/code/[project]/[sessionId]` → chat |
| Credentials | Managed by Pi (`AuthStorage` / `ModelRegistry`); the app never exposes them |
| Model selection | Worker exposes available models; the UI lets the user choose |
| Session persistence | Pi `session.jsonl` files persisted on disk, mapped to app users in the database |
| Working directory | Fixed projects root (`CODING_AGENT_PROJECTS_ROOT`); UI selects a first-level folder as the session `cwd` |
| Tool approval | Automatic execution for the MVP |
| UI fidelity | Minimal: final assistant message + execution indicator |
| Tool set | `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` |

## 3. Architecture

Three-layer architecture connected through narrow interfaces:

```
┌─────────────────────────────────────────────┐
│  Frontend: /agent/code/[project]/[sessionId]│
│  React + @ag-ui/client (HttpAgent)          │
│  SSE to /api/agent/code                     │
└──────────────────┬──────────────────────────┘
                   │ AG-UI events (SSE)
┌──────────────────▼──────────────────────────┐
│  Middleware: Next.js BFF                    │
│  /api/agent/code                            │
│  Auth, session lifecycle, event translation │
└──────────────────┬──────────────────────────┘
                   │ JSON-RPC over Unix socket / TCP
┌──────────────────▼──────────────────────────┐
│  Agent Worker (Node.js process)             │
│  Pi SDK createAgentSessionRuntime           │
│  cwd = CODING_AGENT_PROJECTS_ROOT/<project> │
│  runRpcMode()                               │
└─────────────────────────────────────────────┘
```

### Layer Responsibilities

**Frontend**
- `/agent/code` lists first-level project folders.
- `/agent/code/[project]` lists existing sessions for that project and offers a "New session" button.
- `/agent/code/[project]/[sessionId]` renders the chat for a specific session.
- Creates an `HttpAgent` pointing to `/api/agent/code`.
- Sends `runAgent({ threadId, runId, project, sessionId, messages })` requests.
- Subscribes to AG-UI events and updates the minimal UI.

**Middleware (Next.js)**
- Validates the user session with `withAuth`.
- Lists first-level folders under `CODING_AGENT_PROJECTS_ROOT` so the UI can show available projects.
- Manages the Pi session lifecycle per user and project: create, resume, or dispose.
- Receives the selected project and model from the frontend and forwards them to the worker during session initialization.
- Sends prompts to the worker via JSON-RPC.
- Receives Pi events from the worker, maps them to AG-UI events, and forwards them over SSE.
- Converts worker errors into AG-UI `ErrorEvent` / `RunErrorEvent`.

**Agent Worker**
- A standalone Node.js process that listens on a Unix socket (development) or TCP port (Docker).
- Initializes a Pi `AgentSessionRuntime` with `cwd` set to `<CODING_AGENT_PROJECTS_ROOT>/<project>`.
- Exposes JSON-RPC methods for session management and prompting.
- Streams Pi events back to the middleware.

## 4. Components and Modules

### Frontend

| Module | Purpose |
|---|---|
| `app/(chat)/agent/code/page.tsx` | Lists first-level project folders. |
| `app/(chat)/agent/code/[project]/page.tsx` | Lists sessions for a project + "New session". |
| `app/(chat)/agent/code/[project]/[sessionId]/page.tsx` | Active chat session view. |
| `components/agent-code/project-list.tsx` | Grid of project folders. |
| `components/agent-code/session-list.tsx` | Grid of sessions + new session button. |
| `components/agent-code/agent-code-chat.tsx` | Main chat component. |
| `components/agent-code/execution-indicator.tsx` | Shows when the agent is running tools. |
| `lib/features/agent-code/hooks/use-coding-agent.ts` | Wraps `@ag-ui/client` HttpAgent and event handling. |
| `lib/features/agent-code/actions.ts` | Server actions for listing projects, sessions, available models, and creating/resuming sessions. |

### Middleware

| Module | Purpose |
|---|---|
| `app/(chat)/api/agent/code/route.ts` | SSE endpoint that handles AG-UI runs. |
| `lib/features/agent-code/worker-client.ts` | JSON-RPC client over socket for talking to the worker. |
| `lib/features/agent-code/pi-to-agui-translator.ts` | Maps Pi SDK events to AG-UI events. |
| `lib/features/agent-code/session-store.ts` | Persists the mapping `userId -> sessionId` in Postgres. |
| `lib/features/agent-code/model-mapping.ts` | Maps between app `chatModelId` and Pi `providerId/modelId` pairs. |
| `lib/features/agent-code/project-resolver.ts` | Lists first-level folders under `CODING_AGENT_PROJECTS_ROOT`. |

### Worker

| Module | Purpose |
|---|---|
| `lib/agent-code/worker.ts` | Entry point of the standalone worker process. |
| `lib/agent-code/rpc-server.ts` | JSON-RPC server over socket. |
| `lib/agent-code/session-manager.ts` | Creates, resumes, and disposes Pi sessions. |

## 5. Data Flow

1. The user opens `/agent/code` and sees a list of first-level project folders under `CODING_AGENT_PROJECTS_ROOT`.
2. The user selects a project and navigates to `/agent/code/[project]`, which lists existing sessions and a "New session" button.
3. The user creates a new session or selects an existing one, navigating to `/agent/code/[project]/[sessionId]`.
4. The chat view calls `GET /api/agent/code/models` and renders the existing `ModelPicker` with available `chatModelId` values.
5. The user selects a model and sends a message.
6. The frontend calls `agent.runAgent({ threadId, runId, project, sessionId, messages })`, opening an SSE stream to `/api/agent/code`.
7. Next.js looks up the Pi `sessionId` from the database or creates a new one.
8. Next.js calls the worker JSON-RPC method `initializeSession({ userId, sessionId, project, modelId })` if needed.
9. Next.js calls `sendPrompt({ sessionId, prompt })` on the worker.
10. The worker runs the Pi agent with `cwd` set to `<CODING_AGENT_PROJECTS_ROOT>/<project>`, emitting events (`message_update`, `tool_execution_start`, etc.).
11. Next.js translates Pi events into AG-UI events and writes them to the SSE stream.
12. The frontend renders messages and the execution indicator.
13. When the run finishes, the worker emits `agent_end`; Next.js emits `RUN_FINISHED` and closes the SSE stream cleanly.

## 6. Interfaces and Contracts

### AG-UI Endpoint

- **URL:** `POST /api/agent/code`
- **Headers:** standard auth cookie/session
- **Body:**
  ```json
  {
    "threadId": "user-thread-uuid",
    "runId": "run-uuid",
    "project": "my-project",
    "sessionId": "session-uuid",
    "messages": [
      { "role": "user", "content": "Refactor the chat hook" }
    ],
    "modelId": "opencodeGo/deepseek-v4-pro"
  }
  ```
- **Response:** `text/event-stream` with AG-UI events.

### Project list endpoint

- **URL:** `GET /api/agent/code/projects`
- **Response:** `{ projects: string[] }`

Returns the names of first-level folders under `CODING_AGENT_PROJECTS_ROOT`.

### Session list endpoint

- **URL:** `GET /api/agent/code/[project]/sessions`
- **Response:** `{ sessions: [{ id, label, updatedAt }] }`

Returns the existing coding agent sessions for the given project and the authenticated user.

### JSON-RPC Worker Methods

| Method | Params | Returns |
|---|---|---|
| `initializeSession` | `{ userId, sessionId?, project, modelId? }` | `{ sessionId }` |
| `sendPrompt` | `{ sessionId, prompt }` | stream of Pi events |
| `getAvailableModels` | `{}` | `{ models: [{ providerId, modelId, label }] }` |
| `setModel` | `{ sessionId, modelId }` | `void` |
| `disposeSession` | `{ sessionId }` | `void` |

The worker's `modelId` is a composite identifier such as `opencodeGo/deepseek-v4-pro` (`providerId/modelId`). The worker parses it and calls `modelRegistry.find(providerId, modelId)`.

### App-facing model endpoint

- **URL:** `GET /api/agent/code/models`
- **Response:** `{ models: chatModelId[] }`

This endpoint returns only the `chatModelId` values that are **both** supported by the app's UI and available in Pi (i.e., have valid credentials). This lets the frontend reuse the existing `ModelPicker` component without changes.

### Model mapping

The coding agent operates exclusively with models served by the `opencodeGo` provider. The worker's `getAvailableModels()` returns all `opencodeGo` models that have valid credentials configured in Pi.

The middleware keeps a bidirectional map between app `chatModelId` values and Pi `opencodeGo/<modelId>` pairs:

| App `chatModelId` | Pi provider | Pi model |
|---|---|---|
| `Deepseek v4 Flash` | `opencodeGo` | `deepseek-v4-flash` |
| `Deepseek v4 Pro` | `opencodeGo` | `deepseek-v4-pro` |
| `Kimi K2.6` | `opencodeGo` | `kimi-k2.6` |
| `Qwen 3.6 Plus` | `opencodeGo` | `qwen3.6-plus` |
| `MiMo V2.5` | `opencodeGo` | `mimo-v2.5` |
| `MiMo V2.5 Pro` | `opencodeGo` | `mimo-v2.5-pro` |

This mapping lives in `lib/features/agent-code/model-mapping.ts`. It is used to:
1. Filter Pi's available `opencodeGo` models down to the app's `chatModelId` set.
2. Convert the user's selected `chatModelId` into the Pi `opencodeGo/<modelId>` identifier sent to the worker.

### Pi to AG-UI Event Mapping

| Pi Event | AG-UI Event | Notes |
|---|---|---|
| `agent_start` | `RUN_STARTED` | Run begins. |
| `agent_end` | `RUN_FINISHED` | Run ends. |
| `message_start` | `TEXT_MESSAGE_START` | Assistant message begins. |
| `message_update` with `text_delta` | `TEXT_MESSAGE_CONTENT` | Streaming text chunk. |
| `message_end` | `TEXT_MESSAGE_END` | Assistant message ends. |
| `tool_execution_start` | `TOOL_CALL_START` | Tool call begins. |
| `tool_execution_update` | `RAW` or `TOOL_CALL_ARGS` | Streaming tool output; minimal UI may ignore. |
| `tool_execution_end` | `TOOL_CALL_END` / `TOOL_RESULT` | Tool call result. |
| Error events | `RUN_ERROR` / `ErrorEvent` | Propagate with message. |

## 7. Security and Isolation

- The worker runs as a restricted OS user in production.
- The worker's `cwd` is strictly `<CODING_AGENT_PROJECTS_ROOT>/<project>`.
- The worker validates that `project` is a first-level folder under `CODING_AGENT_PROJECTS_ROOT` before changing directory.
- The worker is started as a separate process by the deployment tooling (not spawned by Next.js), with an explicit, minimal environment variable whitelist.
- Pi credentials (`auth.json`) are readable only by the worker's OS user.
- The middleware never forwards Pi credentials to the frontend.
- The workspace directory is outside the application source tree by default.
- Future migration to Docker only requires changing the socket to a TCP port and mounting the workspace as a volume.

## 8. Persistence

- Pi stores its session tree in `session.jsonl` files.
- Worker session directory: `CODING_AGENT_SESSIONS_DIR/<userId>/<project>/<sessionId>/session.jsonl`.
- The app stores one row per coding agent session in a new table:
  ```sql
  CREATE TABLE coding_agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    project TEXT NOT NULL,
    session_id TEXT NOT NULL UNIQUE,
    label TEXT,
    model_id TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ```
- On resume, Next.js sends the existing `sessionId` and `project` to the worker so Pi can continue the conversation in the correct `cwd`.
- A session can be renamed by the user via a server action to set `label`.

## 9. Models and Credentials

- The worker creates a `ModelRegistry` backed by Pi's `AuthStorage`.
- The coding agent uses only models from the `opencodeGo` provider.
- The worker's `getAvailableModels()` returns all `opencodeGo` models with valid credentials configured.
- The middleware maps Pi `opencodeGo/<modelId>` values to the app's `chatModelId` values using `lib/features/agent-code/model-mapping.ts`.
- `GET /api/agent/code/models` returns the intersection of available `opencodeGo` models and app-supported `chatModelId` values.
- The frontend reuses the existing `ModelPicker` component, which already works with `chatModelId`.
- When the user selects a model, the middleware converts the `chatModelId` back to the Pi `opencodeGo/<modelId>` identifier before sending it to the worker.
- No API keys are stored in the app's database; Pi uses its own `auth.json` or environment variables.

## 10. UI/UX

- Minimal MVP UI:
  - `/agent/code`: grid of project folders (first-level under `CODING_AGENT_PROJECTS_ROOT`).
  - `/agent/code/[project]`: grid of existing sessions + "New session" button.
  - `/agent/code/[project]/[sessionId]`: chat header with project name, session label, model selector; scrollable message list; input box; execution indicator (spinner + "Running...") shown while the agent is busy.
- No per-tool consoles or diff viewers in the MVP.
- Future iterations can expand collapsed tool cards and diff viewers without changing the architecture.

## 11. Error Handling

| Scenario | Behavior |
|---|---|
| Worker process crashes | Middleware emits `RUN_ERROR`, attempts to reconnect once, and surfaces a user-facing message. |
| Prompt fails | Pi emits an error event; middleware translates it to `RUN_ERROR`. |
| Session file is corrupt | Worker throws; middleware creates a new session and notifies the user. |
| Invalid model selected | Worker returns an error before streaming; middleware emits `RUN_ERROR`. |
| SSE disconnects | Frontend reconnects with the same `threadId`/`runId`; middleware resumes if possible. |

## 12. Testing

- **Unit tests:** `pi-to-agui-translator.ts` with representative Pi event streams.
- **Integration tests:** worker client against a minimal worker that emits synthetic Pi events.
- **E2E tests (Playwright):** a stub worker is used so tests do not require Pi credentials or execute real commands.
- **Security tests:** verify that env vars are filtered and the worker cannot escape `CODING_AGENT_PROJECTS_ROOT`.

## 13. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Arbitrary code execution via `bash` | Restricted OS user, limited `cwd`, env filtering. |
| Credential leakage | Pi credentials isolated; never forwarded to frontend. |
| Worker unavailability | Health checks and reconnect logic in the middleware. |
| Workspace pollution | One workspace per deployment; future Docker volumes can scope per user. |
| Vendor lock-in to Pi | AG-UI abstraction at the frontend; worker is replaceable. |

## 14. Development and Deployment

### Local development

Two processes must run:

1. **Next.js app:** `pnpm dev` (existing command).
2. **Agent worker:** `pnpm worker:dev` (new command), which starts `lib/agent-code/worker.ts` listening on a Unix socket.

The middleware reads the socket path from `CODING_AGENT_SOCKET_PATH` (default: `/tmp/coding-agent.sock`).

### Environment variables

| Variable | Purpose | Example |
|---|---|---|
| `CODING_AGENT_PROJECTS_ROOT` | Root directory containing project folders | `/home/agent/projects` |
| `CODING_AGENT_SESSIONS_DIR` | Directory for Pi session files | `/home/agent/sessions` |
| `CODING_AGENT_SOCKET_PATH` | Unix socket path (dev) | `/tmp/coding-agent.sock` |
| `CODING_AGENT_PORT` | TCP port (Docker/prod) | `9000` |
| `CODING_AGENT_AUTH_JSON` | Path to Pi `auth.json` | `/home/agent/.pi/agent/auth.json` |

### Production deployment

- Run the worker under a dedicated, unprivileged OS user.
- Set `CODING_AGENT_PROJECTS_ROOT` and `CODING_AGENT_SESSIONS_DIR` to directories owned by that user.
- Ensure the Next.js process can connect to the worker socket/port but cannot read `auth.json`.
- Use a process manager (systemd, pm2, etc.) to keep the worker alive.

## 15. Future Work

- Containerize the worker with Docker and a dedicated volume per user.
- Add approval UI for destructive tools (`edit`, `write`, `bash`).
- Expand UI to show live tool consoles and code diff viewers.
- Support multiple concurrent coding sessions per user.
- Add workspace snapshots/checkpoints before destructive operations.
