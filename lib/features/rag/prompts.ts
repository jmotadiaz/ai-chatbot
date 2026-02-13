export const toolDescriptionPrompt = `
Primary interface for retrieving information from the knowledge base. Use this tool whenever the user asks technical questions, requests code examples, or needs clarification on concepts documentation.
`;

export const multiHopQueryPrompt = `
Identify 1 to 5 distinct core subjects or entities from the user's request.

For each subject, generate a targeted, standalone search query following these rules:

1. **Atomic & Isolated Scope**: Ensure queries are 'orthogonal', meaning a query describing one core subject MUST NOT mention the other core subjects. Example:
    - ** Idenfied Core Contepts**: Node.js and Redis
    - **BAD**: "Optimizing Node.js APIs for Redis caching" (Mixes Node.js and Redis)
    - **GOOD**: Query 1: "Node.js API optimization techniques", Query 2: "Redis caching patterns"
2. **Language**: Queries MUST be in English.
`;

export const queryRewritePrompt = `
Generate a single, fully self-contained search query that encapsulates the core user intent.

**Requirements**:
  1. This string will be used for the Reranking step, so it must be a grammatically correct, semantically dense question or statement.
  2. Identify the main keywords.
  3. Resolve any pronouns (it, they, this) or ambiguous references based on conversation history (Contextual De-aliasing).
`;
