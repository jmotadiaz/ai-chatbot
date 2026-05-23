## Why

Long chat sessions accumulate messages that exceed the model's context window, degrading response quality or failing outright. Today, every message is sent to the model on every request, with no truncation or summarization strategy. Adding context compaction allows the system to automatically summarize older messages, keeping context usage within the model's window while preserving critical information.

## What Changes

- New `chat_summary` database table for persisting conversation summaries (append-only, upsert logic)
- New `lib/features/compaction/` module with summarization, token estimation, cut-point logic, and orchestration
- Integration into `onFinish` in `factory.ts` to trigger compaction after each turn when threshold is exceeded
- Integration into `processChatResponse` to rebuild context by replacing summarized messages with the summary
- New configuration parameters: `keepRecentTokens`, `reserveTokens`, `contextWindow`
- Model selection for summary generation based on message content type

## Capabilities

### New Capabilities
- `context-compaction`: Automatic summarization of older conversation messages to manage context window usage, triggered when estimated tokens exceed the model's window minus a safety reserve

### Modified Capabilities
<!-- No existing specs are modified -->

## Impact

- **Database**: New `chat_summary` table migration required
- **Code**: New `lib/features/compaction/` module; integration points in `lib/features/chat/conversation/factory.ts` (onFinish) and conversation processing pipeline
- **Configuration**: New compaction parameters (keepRecentTokens, reserveTokens, model selection for summarization)
- **Dependencies**: Uses existing model infrastructure (Deepseek Flash v4 for text, Qwen 3.6 Plus for multimodal); no new external dependencies
- **Performance**: Background LLM call for summary generation when threshold is crossed; no impact on response latency
