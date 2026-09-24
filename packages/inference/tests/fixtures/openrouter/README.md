# OpenRouter Decisions API fixtures

Captured from a real `POST https://openrouter.ai/api/alpha/decisions` call
(model `typesafe/jev-1.13`, 2026-09-21, latency 759 ms, cost $0.000017976),
originally through the Chat Mode Router before `decide()` moved into this
package (ticket 05 of the Inference Kit). The `answers` key was renamed from
the chat-mode-routing question's own key (`mode`) to `decide()`'s generic,
caller-invisible question key (`decision`); every other field is exactly as
captured.

- `decisions-response.json`: the raw response body exactly as it came off the
  wire, i.e. `usage` uses the snake_case `input_tokens` / `output_tokens` keys
  the SDK remaps to `inputTokens` / `outputTokens`. Tests replay it through the
  real SDK inbound schema, so it must not be pre-parsed.

The key and the request body of that probe are not kept here; the contract test
captures the outgoing request from the SDK itself.
