## ADDED Requirements

### Requirement: UserMemory table schema
The system SHALL persist user memory facts in a `UserMemory` PostgreSQL table with the following columns: `id` (uuid, PK), `userId` (uuid, FK to User), `category` (enum: personal, professional, preferences), `content` (text), `embedding` (vector 768-dim), `source` (enum: extracted, explicit), `createdAt` (timestamp), `updatedAt` (timestamp).

#### Scenario: Table supports vector similarity queries
- **WHEN** a cosine similarity search is performed against the `embedding` column
- **THEN** the query uses an HNSW index with `vector_cosine_ops` for efficient nearest-neighbor lookup

#### Scenario: Table supports category-based queries
- **WHEN** querying facts by userId and category (e.g., all preferences for a user)
- **THEN** the query uses a btree index on `(userId, category)` for efficient filtering

#### Scenario: Cascade deletion with user
- **WHEN** a User record is deleted
- **THEN** all associated UserMemory records are automatically deleted via ON DELETE CASCADE

### Requirement: CRUD operations for memory facts
The system SHALL provide database query functions for creating, reading, updating, and deleting memory facts.

#### Scenario: Insert a new memory fact
- **WHEN** a new fact is extracted with category, content, and embedding
- **THEN** the system inserts a new record into UserMemory with the provided data and sets `createdAt` and `updatedAt` to the current timestamp

#### Scenario: Update an existing memory fact
- **WHEN** an existing fact is identified for update (via dedup similarity match)
- **THEN** the system updates the `content`, `embedding`, and `updatedAt` fields of the matched record

#### Scenario: Query all preferences for a user
- **WHEN** the system needs to load all preference-category facts for a user
- **THEN** it executes `SELECT * FROM UserMemory WHERE userId = ? AND category = 'preferences'` and returns all matching records

#### Scenario: Semantic search within personal and professional facts
- **WHEN** the system needs to find contextually relevant facts
- **THEN** it executes a cosine similarity search on the `embedding` column filtered by `userId` and `category IN ('personal', 'professional')`, returning facts above a configurable similarity threshold, ordered by similarity descending, limited to a configurable top-N

#### Scenario: Find semantically similar facts for deduplication
- **WHEN** a new fact with embedding is being checked for duplicates
- **THEN** the system queries existing facts for the same user with cosine similarity > 0.85, returning the closest match if any

#### Scenario: Delete all memory facts for a user
- **WHEN** a user requests deletion of all their memory data
- **THEN** the system deletes all UserMemory records where `userId` matches
