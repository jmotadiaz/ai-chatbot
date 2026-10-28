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
 * The toolkit's rendering for `choice` with the question's answer fields
 * overlaid. `choice` must still be one of the question's criteria.
 */
export const answerDecisionWith =
  (question: string, choice: string, fields: Record<string, unknown>) =>
  (request: DecisionsRequest): OperationReply => {
    const rendered = decisionsResponse(request, {
      choices: { [question]: choice },
    });
    const body = rendered.body as {
      answers: Record<string, Record<string, unknown>>;
    };
    return {
      ...rendered,
      body: {
        ...body,
        answers: {
          ...body.answers,
          [question]: { ...body.answers[question], ...fields },
        },
      },
    };
  };

/** An arbitrary Decisions payload, for the responses a healthy answer never is. */
export const answerDecisionRaw =
  (body: unknown) =>
  (): OperationReply => ({ body });
