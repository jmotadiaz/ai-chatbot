## ADDED Requirements

### Requirement: Extract memory facts from conversation messages
The system SHALL analyze conversation messages after each chat response and extract persistent user facts. Facts SHALL be categorized as `personal`, `professional`, or `preferences`. The extraction API SHALL accept an array of messages to allow flexibility in what is analyzed.

#### Scenario: Successful extraction of user facts
- **WHEN** a conversation contains user-revealing information (e.g., "I live in Madrid and work as a DevOps engineer")
- **THEN** the system extracts structured facts: `{category: "personal", content: "The user lives in Madrid, Spain"}` and `{category: "professional", content: "The user works as a DevOps engineer"}`

#### Scenario: No extractable facts in conversation
- **WHEN** a conversation contains no user-revealing information (e.g., "What is the capital of France?")
- **THEN** the system returns an empty array of facts and performs no database writes

#### Scenario: Preference detection
- **WHEN** a user expresses an interaction preference (e.g., "Please keep your answers short" or "Respond in Spanish")
- **THEN** the system extracts a fact with category `preferences` (e.g., `{category: "preferences", content: "The user prefers concise, short answers"}`)

#### Scenario: Extraction does not block chat response
- **WHEN** the memory extraction is triggered in the onFinish callback
- **THEN** it runs asynchronously (fire-and-forget) and does not add latency to the user's response

#### Scenario: Extraction failure is non-fatal
- **WHEN** the LLM extraction call fails (network error, model error, etc.)
- **THEN** the error is logged and the chat response is unaffected

### Requirement: Deduplicate extracted facts against existing memory
The system SHALL compare each newly extracted fact against the user's existing memory facts using embedding cosine similarity. If a semantically equivalent fact already exists (similarity > 0.85), the system SHALL update the existing fact instead of creating a duplicate.

#### Scenario: New fact with no existing match
- **WHEN** a new fact "The user prefers dark mode" is extracted and no existing fact has cosine similarity > 0.85
- **THEN** the system inserts the fact as a new record with its embedding

#### Scenario: New fact matches an existing fact
- **WHEN** a new fact "User lives in Madrid" is extracted and an existing fact "The user is located in Madrid, Spain" has cosine similarity > 0.85
- **THEN** the system updates the existing fact's content and embedding with the new values and updates `updatedAt`

#### Scenario: Embedding generation for extracted facts
- **WHEN** facts are extracted from a conversation
- **THEN** each fact's content SHALL have a 768-dimensional embedding generated using the same embedding model as the RAG system (`gemini-embedding-001`)
