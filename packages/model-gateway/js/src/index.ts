/**
 * Official Model Gateway testing toolkit — main entry.
 *
 * Protocol fixtures, per-instance scenarios and MSW handlers. This entry NEVER
 * imports `node:http` (directly or transitively) so jsdom-based consumers can
 * import it; the Node HTTP server lives in the `./server` subpath export.
 *
 * No test-runner hooks and no production client on purpose: the consumer owns its
 * catalog, its responders and the MSW lifecycle (`setupServer`).
 */

export type {
  ChatDelta,
  ChatMessage,
  ChatReply,
  ChatRequest,
  ChatStep,
  ChatToolCallDelta,
  DecisionQuestion,
  DecisionsRequest,
  EmbeddingsRequest,
  GatewayDispatch,
  GatewayHeaders,
  GatewayRequestInit,
  GatewayResult,
  OperationReply,
  RecordedRequest,
  RenderedChatResponse,
  RerankRequest,
  SpeechRequest,
  SseEvent,
} from "./types";

export {
  CHAT_COMPLETION_CREATED,
  CHAT_COMPLETION_ID,
  HEALTH_BODY,
  HEALTH_PATH,
  JSON_HEADERS,
  SSE_DONE_FRAME,
  SSE_HEADERS,
  catalogResponse,
  decisionsResponse,
  deterministicEmbedding,
  deterministicWav,
  embeddingsResponse,
  errorBody,
  imageReply,
  midStreamErrorReply,
  pacedTextReply,
  reasoningReply,
  renderChatResponse,
  rerankResponse,
  scriptedReply,
  speechResponse,
  textReply,
  toolCallReply,
  toolResultReply,
  unauthorizedResponse,
} from "./protocol";
export type { GatewayCatalog } from "./protocol";

export {
  GatewayScenarioError,
  createGatewayScenario,
  hasAuthorization,
} from "./scenario";
export type { GatewayScenario, GatewayScenarioConfig } from "./scenario";

export { createGatewayHandlers } from "./msw";
