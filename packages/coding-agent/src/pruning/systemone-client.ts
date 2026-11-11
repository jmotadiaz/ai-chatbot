/**
 * HTTP client of the calibrated judge (`POST /v1/systemone`, spec D5 Phase 1
 * and D6).
 *
 * The client owns the transport concerns only: endpoint, credentials, the 4 s
 * timeout composed with the Turn's abort signal, and defensive validation of
 * the response. It never decides anything: the caller (ticket 06) merges the
 * per-batch answers and hands them to `applyDecisionPolicy`, which defaults
 * every missing or invalid answer to probability `1.0` (`keep`) and therefore
 * fails open.
 *
 * Two constraints shape this module:
 * - Pi loads the pruning extension through jiti, so the client may use only
 *   globals (`fetch`, `AbortSignal`) and pure type imports.
 * - Credentials arrive from `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)`:
 *   the client never reads configuration or environment variables.
 */
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  type ToolPruningConfig,
} from "./config";
import type { DecisionQuestion } from "./decision-state";

/** Contract model served by the Model Gateway for pruning decisions. */
export const DECISION_MODEL = "decision-default";

/** Everything needed to reach the Gateway decision endpoint. */
export interface SystemOneClientOptions {
  /**
   * Gateway base URL. It already ends in `/v1` (`ctx.model.baseUrl`), so the
   * client appends `/systemone` and never rewrites the path.
   */
  baseUrl: string;
  /** Bearer token from `getApiKeyAndHeaders`; omitted when the Gateway needs none. */
  apiKey?: string;
  /** Extra headers `getApiKeyAndHeaders` returned (e.g. routing or org headers). */
  headers?: Readonly<Record<string, string>>;
  /** Decision model, defaults to `decision-default`. */
  model?: string;
  /** Provides `decisionTimeoutMs` (4 000 ms by default). */
  config?: ToolPruningConfig;
  /** Abort signal of the current Turn (`ctx.getSignal()`). */
  signal?: AbortSignal;
}

/** One decision request: the compact state plus one batch of `noul` questions. */
export interface SystemOneDecisionRequest {
  /** State document built by `buildDecisionPlan`. */
  state: unknown;
  /** Named `noul` questions of one batch (`result_c1`, `call_c1`, …). */
  questions: Readonly<Record<string, DecisionQuestion>>;
}

/** Why a decision request produced no usable answers. */
export type SystemOneFailureReason =
  | "timeout"
  | "aborted"
  | "http_error"
  | "network_error"
  | "invalid_response";

/** Successful request: only valid `noul` probabilities remain. */
export interface SystemOneSuccess {
  readonly ok: true;
  /**
   * Valid probabilities in `[0, 1]` keyed by question name. Invalid or missing
   * answers are omitted on purpose so the policy defaults them to `1.0`.
   */
  readonly answers: Readonly<Record<string, number>>;
  readonly model?: string;
  readonly provider?: string;
  /** Cost reported by the Gateway, when it reports one. */
  readonly cost?: number;
  readonly latencyMs: number;
}

/** Failed request. The caller decides the fail-open policy (spec D6). */
export interface SystemOneFailure {
  readonly ok: false;
  readonly reason: SystemOneFailureReason;
  readonly status?: number;
  readonly message?: string;
  readonly latencyMs: number;
}

/** Typed outcome of one `/v1/systemone` call. */
export type SystemOneResult = SystemOneSuccess | SystemOneFailure;

/**
 * Posts one batch of `noul` questions to `${baseUrl}/systemone`.
 *
 * The request is aborted by the configured `decisionTimeoutMs` (4 000 ms) or by
 * the Turn signal, whichever fires first; a user abort reports `aborted`, a
 * timeout reports `timeout`, and neither writes anything to the session.
 */
export async function requestSystemOneDecision(
  request: SystemOneDecisionRequest,
  options: SystemOneClientOptions,
): Promise<SystemOneResult> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(
    1,
    options.config?.decisionTimeoutMs ?? DEFAULT_TOOL_PRUNING_CONFIG.decisionTimeoutMs,
  );
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    options.signal === undefined
      ? timeoutSignal
      : AbortSignal.any([timeoutSignal, options.signal]);

  let response: Response;
  try {
    response = await fetch(`${endpointOf(options.baseUrl)}`, {
      method: "POST",
      headers: requestHeaders(options),
      body: JSON.stringify({
        model: options.model ?? DECISION_MODEL,
        state: request.state,
        questions: request.questions,
      }),
      signal,
    });
  } catch (error) {
    return {
      ok: false,
      reason: classifyFetchError(error, options.signal),
      message: messageOf(error),
      latencyMs: Date.now() - startedAt,
    };
  }

  const status = response.status;
  if (!response.ok) {
    // Drain the body so the socket can be reused; its content is not useful.
    await response.text().catch(() => "");
    return {
      ok: false,
      reason: "http_error",
      status,
      latencyMs: Date.now() - startedAt,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await response.text());
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_response",
      status,
      message: messageOf(error),
      latencyMs: Date.now() - startedAt,
    };
  }

  const parsed = parseDecisionResponse(payload);
  if (parsed === undefined) {
    return {
      ok: false,
      reason: "invalid_response",
      status,
      latencyMs: Date.now() - startedAt,
    };
  }

  return {
    ok: true,
    answers: parsed.answers,
    ...(parsed.model === undefined ? {} : { model: parsed.model }),
    ...(parsed.provider === undefined ? {} : { provider: parsed.provider }),
    ...(parsed.cost === undefined ? {} : { cost: parsed.cost }),
    latencyMs: Date.now() - startedAt,
  };
}

/** `${baseUrl}/systemone`, tolerating a trailing slash on `baseUrl`. */
function endpointOf(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/systemone`;
}

/**
 * Request headers: JSON in and out, the bearer token from `getApiKeyAndHeaders`
 * and any extra headers it returned. An explicit `apiKey` wins over an
 * `authorization` entry in `headers`, so a stale header cannot shadow it.
 */
function requestHeaders(options: SystemOneClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  const hasApiKey = options.apiKey !== undefined && options.apiKey.length > 0;
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (hasApiKey && name.toLowerCase() === "authorization") continue;
    headers[name] = value;
  }
  if (options.apiKey !== undefined && options.apiKey.length > 0) {
    headers.authorization = `Bearer ${options.apiKey}`;
  }
  return headers;
}

/** Parsed, defensively validated body of a successful decision response. */
interface ParsedDecisionResponse {
  answers: Record<string, number>;
  model?: string;
  provider?: string;
  cost?: number;
}

/**
 * Validates the response envelope: it must be an object with an `answers`
 * object. Individual answers are read leniently — anything that is not a
 * finite number in `[0, 1]` (raw number, `{ noul: <number> }` or any other
 * shape) is omitted, which the policy treats as `1.0` (`keep`).
 */
function parseDecisionResponse(payload: unknown): ParsedDecisionResponse | undefined {
  if (!isRecord(payload)) return undefined;
  const rawAnswers = payload.answers;
  if (!isRecord(rawAnswers)) return undefined;

  const answers: Record<string, number> = {};
  for (const [name, answer] of Object.entries(rawAnswers)) {
    const probability = readNoulProbability(answer);
    if (probability !== undefined) answers[name] = probability;
  }

  const usage = isRecord(payload.usage) ? payload.usage : undefined;
  const cost = usage?.cost;
  return {
    answers,
    model: typeof payload.model === "string" ? payload.model : undefined,
    provider: typeof payload.provider === "string" ? payload.provider : undefined,
    cost:
      typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : undefined,
  };
}

/** Probability carried by one answer body, when it is valid. */
function readNoulProbability(answer: unknown): number | undefined {
  const value =
    typeof answer === "number" ? answer : isRecord(answer) ? answer.noul : undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

/**
 * Maps a `fetch` rejection to a typed failure: a Turn abort wins over the
 * timeout (the user cancelled first), the timeout signal reports itself as
 * `TimeoutError`, and anything else is a transport error.
 */
function classifyFetchError(
  error: unknown,
  turnSignal: AbortSignal | undefined,
): SystemOneFailureReason {
  if (turnSignal?.aborted === true) return "aborted";
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  // `AbortSignal.any` may surface the abort as `AbortError`; the Turn is not
  // aborted here, so the timeout is the only remaining source.
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "network_error";
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
