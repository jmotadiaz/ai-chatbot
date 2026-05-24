## ADDED Requirements

### Requirement: contextWindow is part of ModelConfiguration

The `ModelConfiguration` type SHALL include an optional `contextWindow` field (`number`). When the value is absent, the system SHALL default to 128,000. Individual model configurations SHALL NOT be modified to include this field — the type exists for future per-model overrides.

#### Scenario: contextWindow resolved from model config
- **WHEN** the active model's configuration has `contextWindow` defined
- **THEN** the system SHALL use that value as the context window

#### Scenario: contextWindow falls back to default
- **WHEN** the active model's configuration does not have `contextWindow`
- **THEN** the system SHALL use 128,000 as the default context window

### Requirement: System prunes messages before sending to the model

Before sending messages to the model (and before compaction), the system SHALL use the AI SDK's `pruneMessages` utility to clean the message list. Only `reasoning` and `emptyMessages` pruning SHALL be applied.

#### Scenario: Reasoning is pruned
- **WHEN** messages contain reasoning parts
- **THEN** the system SHALL call `pruneMessages` with `reasoning: 'before-last-message'` to strip reasoning from all but the last user-assistant pair

#### Scenario: Empty messages are removed
- **WHEN** messages have empty text parts
- **THEN** the system SHALL call `pruneMessages` with `emptyMessages: 'remove'`

### Requirement: System detects when context compaction is needed

The system SHALL estimate the total token count of all messages in the current chat after each assistant response completes. If the estimated token count exceeds the active model's context window minus a configurable reserve (`reserveTokens`), the system SHALL trigger compaction.

#### Scenario: Token threshold exceeded during active session
- **WHEN** the estimated token count of all messages exceeds `contextWindow - reserveTokens`
- **THEN** the system SHALL generate a summary of the older messages and persist it

#### Scenario: Token threshold not exceeded
- **WHEN** the estimated token count is within `contextWindow - reserveTokens`
- **THEN** the system SHALL NOT trigger compaction

### Requirement: System estimates token counts

The system SHALL estimate token counts for messages using a heuristic of `total character count / 4`. For image and PDF file parts, the system SHALL use a flat estimate of 4800 characters per file. When the provider returns actual token usage data, the system MAY use that data for the last known assistant response.

#### Scenario: Token estimation for text-only messages
- **WHEN** a message contains only text parts
- **THEN** the estimate SHALL be the sum of all text part lengths divided by 4

#### Scenario: Token estimation for messages with file parts
- **WHEN** a message contains a file part (image, PDF)
- **THEN** the estimate SHALL add 4800 characters per file part to the text total before dividing by 4

### Requirement: System generates a structured summary

The system SHALL generate a structured summary of the messages being compacted using an LLM. The summary SHALL follow a fixed format with sections: Goal, Key Facts, Tools Used, Shared Context, Open/Pending, and Next Steps. The generation SHALL happen asynchronously in the background.

#### Scenario: Summary generation for text-only content
- **WHEN** the messages to be summarized contain only text parts
- **THEN** the system SHALL use Deepseek Flash v4 to generate the summary

#### Scenario: Summary generation for content with multimedia
- **WHEN** the messages to be summarized contain file parts (images, PDFs)
- **THEN** the system SHALL use Qwen 3.6 Plus to generate the summary, including images as base64 in the prompt

#### Scenario: Summary is persisted
- **WHEN** the summary is generated
- **THEN** the system SHALL insert a new row in `chat_summary` with chatId, messageId (last summarized message), summary text, estimated tokens before compaction, and the model used

### Requirement: Context is rebuilt using the summary

When processing a chat request, the system SHALL check if a summary exists for the chat. If a summary exists, messages with serial equal to or less than the summary's `messageId` SHALL be excluded from the model context, and the summary text SHALL be injected into the system prompt with a "## Previous Context" preamble.

#### Scenario: Summary exists and is applied
- **WHEN** a request is processed and a summary exists with `messageId = M`
- **THEN** messages with `serial <= M` SHALL be excluded from the model context
- **THEN** the summary text SHALL be prepended to the system prompt

#### Scenario: No summary exists
- **WHEN** a request is processed and no summary exists
- **THEN** all messages SHALL be sent to the model as today

### Requirement: Cut point selects which messages to keep

The system SHALL determine which messages to retain (not summarize) by walking the message list from newest to oldest, accumulating estimated tokens until the accumulated count reaches `keepRecentTokens`. The cut SHALL always fall between complete messages.

#### Scenario: Cut point preserves recent messages
- **WHEN** `keepRecentTokens` is 20000 and the last 5 messages total ~22000 estimated tokens
- **THEN** the cut point SHALL ensure approximately 20000 tokens of recent messages are retained

#### Scenario: Messages are atomic units
- **WHEN** finding the cut point
- **THEN** the cut SHALL always be between complete messages, never within a message's parts

### Requirement: Persistence is append-only

The system SHALL store each compaction as a new row in `chat_summary`. The application SHALL read only the most recent row per chat. Historical rows SHALL be preserved for debugging and audit purposes.

#### Scenario: Multiple compactions for the same chat
- **WHEN** compaction runs a second time for the same chat
- **THEN** a new row SHALL be inserted with the updated summary
- **THEN** the read path SHALL only use the row with the latest `createdAt`

### Requirement: Compaction is triggered on onFinish

The system SHALL trigger the compaction check in the `onFinish` callback of the chat response stream, after messages are persisted and memory extraction completes. Compaction SHALL NOT block or delay the response to the user.

#### Scenario: Compaction runs after response is complete
- **WHEN** an assistant response finishes streaming
- **THEN** messages SHALL be persisted first
- **THEN** memory extraction SHALL run
- **THEN** the compaction check SHALL run asynchronously
- **THEN** the user SHALL receive the response without waiting for compaction
