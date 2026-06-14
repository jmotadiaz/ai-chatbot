# Coding Agent Integration Design

## 1. Context and Goal

Integrate an autonomous coding agent into the existing AI chatbot application. The agent will use the **Pi SDK** (`@earendil-works/pi-coding-agent`) for reasoning and tool execution, and the **AG-UI protocol** (`@ag-ui/client`) for streaming communication between the frontend and the Next.js backend.

The agent must be able to read, modify, and execute code in a local workspace safely, with session persistence and a design that can evolve toward containerized isolation.

## 2. Key Decisions

| Topic | MVP Decision |
|---|---|
| Isolation | Restricted host process (preparation for future Docker) |
| Entry point | Dedicated view at `/agent/code`, reachable from the sidebar |
| Credentials | Managed by Pi (`AuthStorage` / `ModelRegistry`); the app never exposes them |
| Model selection | Worker exposes available models; the UI lets the user choose |
| Session persistence | Pi `session.jsonl` files persisted on disk, mapped to app users in the database |
| Working directory | Fixed global workspace configured via `CODING_AGENT_WORKSPACE` |
| Tool approval | Automatic execution for the MVP |
| UI fidelity | Minimal: final assistant message + execution indicator |
| Tool set | `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` |

## 3. Architecture

Three-layer architecture connected through narrow interfaces:

```
┌─────────────────────────────────────────────┐
│  Frontend: /agent/code                      │
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
│  cwd = CODING_AGENT_WORKSPACE               │
│  runRpcMode()                               │
└─────────────────────────────────────────────┘
```

### Layer Responsibilities

**Frontend**
- Renders the dedicated coding agent view.
- Creates an `HttpAgent` pointing to `/api/agent/code`.
- Sends `runAgent({ threadId, runId, messages })` requests.
- Subscribes to AG-UI events and updates the minimal UI.

**Middleware (Next.js)**
- Validates the user session with `withAuth`.
- Manages the Pi session lifecycle per user: create, resume, or dispose.
- Receives the selected model from the frontend and forwards it to the worker during session initialization.
- Sends prompts to the worker via JSON-RPC.
- Receives Pi events from the worker, maps them to AG-UI events, and forwards them over SSE.
- Converts worker errors into AG-UI `ErrorEvent` / `RunErrorEvent`.

**Agent Worker**
- A standalone Node.js process that listens on a Unix socket (development) or TCP port (Docker).
- Initializes a Pi `AgentSessionRuntime` with `cwd` set to `CODING_AGENT_WORKSPACE`.
- Exposes JSON-RPC methods for session management and prompting.
- Streams Pi events back to the middleware.

## 4. Components and Modules

### Frontend

| Module | Purpose |
|---|---|
| `app/(chat)/agent/code/page.tsx` | Route shell for the coding agent view. |
| `components/agent-code/agent-code-chat.tsx` | Main chat component. |
| `components/agent-code/execution-indicator.tsx` | Shows when the agent is running tools. |
| `lib/features/agent-code/hooks/use-coding-agent.ts` | Wraps `@ag-ui/client` HttpAgent and event handling. |
| `lib/features/agent-code/actions.ts` | Server actions for listing available models and resuming sessions. |

### Middleware

| Module | Purpose |
|---|---|
| `app/(chat)/api/agent/code/route.ts` | SSE endpoint that handles AG-UI runs. |
| `lib/features/agent-code/worker-client.ts` | JSON-RPC client over socket for talking to the worker. |
| `lib/features/agent-code/pi-to-agui-translator.ts` | Maps Pi SDK events to AG-UI events. |
| `lib/features/agent-code/session-store.ts` | Persists the mapping `userId -> sessionId` in Postgres. |
| `lib/features/agent-code/model-mapping.ts` | Maps between app `chatModelId` and Pi `providerId/modelId` pairs. |

### Worker

| Module | Purpose |
|---|---|
| `lib/agent-code/worker.ts` | Entry point of the standalone worker process. |
| `lib/agent-code/rpc-server.ts` | JSON-RPC server over socket. |
| `lib/agent-code/session-manager.ts` | Creates, resumes, and disposes Pi sessions. |

## 5. Data Flow

1. The user opens `/agent/code`.
2. The frontend calls `GET /api/agent/code/models` and receives a list of `chatModelId` values.
3. The frontend renders the existing `ModelPicker` with those models. The user selects one and sends a message.
4. The frontend calls `agent.runAgent({ threadId, runId, messages })`, which opens an SSE stream to `/api/agent/code`.
5. Next.js looks up the user's Pi session from the database or creates a new one.
6. Next.js calls the worker JSON-RPC method `initializeSession({ userId, sessionId, modelId })` if needed.
7. Next.js calls `sendPrompt({ sessionId, prompt })` on the worker.
8. The worker runs the Pi agent, emitting events (`message_update`, `tool_execution_start`, etc.).
9. Next.js translates Pi events into AG-UI events and writes them to the SSE stream.
10. The frontend renders messages and the execution indicator.
11. When the run finishes, the worker emits `agent_end`; Next.js emits `RUN_FINISHED` and closes the SSE stream cleanly.

## 6. Interfaces and Contracts

### AG-UI Endpoint

- **URL:** `POST /api/agent/code`
- **Headers:** standard auth cookie/session
- **Body:**
  ```json
  {
    "threadId": "user-thread-uuid",
    "runId": "run-uuid",
    "messages": [
      { "role": "user", "content": "Refactor the chat hook" }
    ],
    "modelId": "anthropic/claude-opus-4-5"
  }
  ```
- **Response:** `text/event-stream` with AG-UI events.

### JSON-RPC Worker Methods

| Method | Params | Returns |
|---|---|---|
| `initializeSession` | `{ userId, sessionId?, modelId? }` | `{ sessionId }` |
| `sendPrompt` | `{ sessionId, prompt }` | stream of Pi events |
| `getAvailableModels` | `{}` | `{ models: [{ providerId, modelId, label }] }` |
| `setModel` | `{ sessionId, modelId }` | `void` |
| `disposeSession` | `{ sessionId }` | `void` |

The worker's `modelId` is a composite identifier such as `anthropic/claude-opus-4-5` (`providerId/modelId`). The worker parses it and calls `modelRegistry.find(providerId, modelId)`.

### App-facing model endpoint

- **URL:** `GET /api/agent/code/models`
- **Response:** `{ models: chatModelId[] }`

This endpoint returns only the `chatModelId` values that are **both** supported by the app's UI and available in Pi (i.e., have valid credentials). This lets the frontend reuse the existing `ModelPicker` component without changes.

### Model mapping

The middleware keeps a bidirectional map between app `chatModelId` values and Pi `(providerId, modelId)` pairs:

| App `chatModelId` | Pi provider | Pi model |
|---|---|---|
| `Claude Opus 4.5` | `anthropic` | `claude-opus-4-5` |
| `Claude Sonnet 4.6` | `anthropic` | `claude-sonnet-4-6` |
| `GPT 5.4` | `openai` | `gpt-5.4` |

This mapping lives in `lib/features/agent-code/model-mapping.ts`. It is used to:
1. Filter Pi's available models down to the app's `chatModelId` set.
2. Convert the user's selected `chatModelId` into the Pi identifier sent to the worker.

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
- The worker's `cwd` is strictly `CODING_AGENT_WORKSPACE`.
- The worker is started as a separate process by the deployment tooling (not spawned by Next.js), with an explicit, minimal environment variable whitelist.
- Pi credentials (`auth.json`) are readable only by the worker's OS user.
- The middleware never forwards Pi credentials to the frontend.
- The workspace directory is outside the application source tree by default.
- Future migration to Docker only requires changing the socket to a TCP port and mounting the workspace as a volume.

## 8. Persistence

- Pi stores its session tree in `session.jsonl` files.
- Worker session directory: `CODING_AGENT_SESSIONS_DIR/<userId>/<sessionId>/session.jsonl`.
- The app stores the mapping `userId -> sessionId` in a new table:
  ```sql
  CREATE TABLE coding_agent_sessions (
    user_id UUID NOT NULL PRIMARY KEY REFERENCES users(id),
    session_id TEXT NOT NULL,
    model_id TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ```
- On resume, Next.js sends the existing `sessionId` to the worker so Pi can continue the conversation.

## 9. Models and Credentials

- The worker creates a `ModelRegistry` backed by Pi's `AuthStorage`.
- The worker's `getAvailableModels()` returns Pi models with valid credentials configured.
- The middleware maps Pi models to the app's `chatModelId` values using `lib/features/agent-code/model-mapping.ts`.
- `GET /api/agent/code/models` returns the intersection of Pi-available models and app-supported `chatModelId` values.
- The frontend reuses the existing `ModelPicker` component, which already works with `chatModelId`.
- When the user selects a model, the middleware converts the `chatModelId` back to the Pi `providerId/modelId` pair before sending it to the worker.
- No API keys are stored in the app's database; Pi uses its own `auth.json` or environment variables.

## 10. UI/UX

- Minimal MVP UI:
  - Header with model selector.
  - Scrollable message list.
  - Input box at the bottom.
  - Execution indicator (spinner + "Running...") shown while the agent is busy.
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
- **Security tests:** verify that env vars are filtered and the worker cannot escape `CODING_AGENT_WORKSPACE`.

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
| `CODING_AGENT_WORKSPACE` | Root directory the agent can read/write | `/home/agent/workspace` |
| `CODING_AGENT_SESSIONS_DIR` | Directory for Pi session files | `/home/agent/sessions` |
| `CODING_AGENT_SOCKET_PATH` | Unix socket path (dev) | `/tmp/coding-agent.sock` |
| `CODING_AGENT_PORT` | TCP port (Docker/prod) | `9000` |
| `CODING_AGENT_AUTH_JSON` | Path to Pi `auth.json` | `/home/agent/.pi/agent/auth.json` |

### Production deployment

- Run the worker under a dedicated, unprivileged OS user.
- Set `CODING_AGENT_WORKSPACE` and `CODING_AGENT_SESSIONS_DIR` to directories owned by that user.
- Ensure the Next.js process can connect to the worker socket/port but cannot read `auth.json`.
- Use a process manager (systemd, pm2, etc.) to keep the worker alive.

## 15. Future Work

- Containerize the worker with Docker and a dedicated volume per user.
- Add approval UI for destructive tools (`edit`, `write`, `bash`).
- Expand UI to show live tool consoles and code diff viewers.
- Support multiple concurrent coding sessions per user.
- Add workspace snapshots/checkpoints before destructive operations.
