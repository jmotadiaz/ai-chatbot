import { decisionsResponse } from "@ai-chatbot/model-gateway-testing";
import type { DecisionsRequest, OperationReply } from "@ai-chatbot/model-gateway-testing";

/**
 * Decisions answers for social unit tests (ADR 0013).
 *
 * The answer itself stays the consumer's: the toolkit only renders the
 * criterion a question is answered with. These helpers keep the three shapes a
 * test needs — a healthy answer, a healthy answer with overlaid fields (a
 * confidence the toolkit never invents, an extra probability key) and a payload
 * the toolkit's builders deliberately refuse to produce (malformed evidence) —
 * without repeating the rendering in every feature suite.
 */

/** Answers one question with `choice`, rendered by the toolkit. */
export const answerDecision =
  (question: string, choice: string) =>
  (request: DecisionsRequest): OperationReply =>
    decisionsResponse(request, { choices: { [question]: choice } });

/**
 * The overlay the toolkit offers for an answer the uniform rendering never
 * invents: extra fields on ONE question's rendered answer (an explicit
 * confidence, an extra probability key). `choice` must still be one of the
 * question's criteria; the toolkit validates both the criterion and the
 * question.
 */
export const answerDecisionWith =
  (question: string, choice: string, fields: Record<string, unknown>) =>
  (request: DecisionsRequest): OperationReply =>
    decisionsResponse(request, {
      choices: { [question]: choice },
      answerFields: { [question]: fields },
    });

/** An arbitrary Decisions payload, for the responses a healthy answer never is. */
export const answerDecisionRaw =
  (body: unknown) =>
  (): OperationReply => ({ body });
