## ADDED Requirements

### Requirement: Retrieve relevant memory facts for current conversation
The system SHALL retrieve memory facts relevant to the current conversation context before each chat response. The retrieval SHALL use a hybrid strategy: preference-category facts are always included, while personal and professional facts are filtered by semantic relevance to the user's current message.

#### Scenario: Preferences are always included
- **WHEN** a user sends any message (e.g., "How do I deploy a Docker container?")
- **THEN** all memory facts with `category = 'preferences'` for that user are included in the retrieved context, regardless of semantic similarity to the message

#### Scenario: Personal/professional facts filtered by relevance
- **WHEN** a user sends "Where should I travel this weekend?"
- **THEN** the system embeds the message and performs cosine similarity search against facts with `category IN ('personal', 'professional')`, returning only facts above the similarity threshold (e.g., "The user lives in Madrid" matches, but "The user specializes in TypeScript" does not)

#### Scenario: No memory facts exist for user
- **WHEN** a new user with no stored memory facts sends a message
- **THEN** the retrieval returns an empty result and the system prompt has no memory section injected

### Requirement: Format memory facts for system prompt injection
The system SHALL format retrieved memory facts into a clearly delineated section suitable for appending to the system prompt. The format SHALL use natural language bullet points under a descriptive header.

#### Scenario: Memory context is formatted for system prompt
- **WHEN** relevant memory facts are retrieved (e.g., "Lives in Madrid", "Prefers concise answers")
- **THEN** the system produces a formatted string:
  ```
  ## What you know about the user
  - Lives in Madrid, Spain
  - Prefers concise answers with code examples
  ```

#### Scenario: Empty memory produces no injection
- **WHEN** no relevant memory facts are found for the user/message combination
- **THEN** the system returns `null` or empty string and the system prompt is not modified

### Requirement: Memory context is injected into supported agent types
The system SHALL inject retrieved memory context into the system prompt of supported agent types (RAG, Web Search, Project). The Context7 agent SHALL BE EXCLUDED from this injection as it currently does not support custom system prompts. The injection SHALL happen in the agent creation phase, before the first LLM call.

#### Scenario: RAG agent receives memory context
- **WHEN** a user with stored memory facts uses the RAG agent
- **THEN** the RAG agent's system prompt includes the formatted memory section alongside its existing prompt

#### Scenario: Project agent receives memory context
- **WHEN** a user with stored memory facts uses a Project agent with a custom system prompt
- **THEN** the project's system prompt is augmented with the formatted memory section

#### Scenario: Memory retrieval latency is minimal
- **WHEN** the system retrieves memory facts for a request
- **THEN** the total retrieval time (embedding generation + vector query + preferences query) SHALL be under 50ms for a typical user with fewer than 100 facts
