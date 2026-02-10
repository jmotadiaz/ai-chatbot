---
name: rag-mcp-guide
description: Instructions for using the rag mcp, including when to use it and how to formulate the input parameters.
---

# RAG Retrieval Tool Guide

## Purpose

To provide guidelines on when and how to use the `retrieve_resource_chunks` tool effectively. This skill ensures that agents leverage the RAG capabilities correctly by formulating high-quality queries and understanding the tool's input parameters.

## When to Use This Skill

This skill should be triggered when:
- The user asks a question that requires knowledge from their uploaded resources/documents.
- The user requests to "search" or "find" specific information within the project context.
- The user asks complex questions that may require synthesizing information from multiple sources (multi-hop reasoning).

## Tool Usage: `retrieve_resource_chunks`

The primary tool for RAG is `retrieve_resource_chunks`. It allows the agent to perform semantic and keyword-based searches across the user's knowledge base.

### Input Parameters

#### 1. `multiHopQueries` (Array of Strings)
This is the most critical parameter. It defines the search strategy.

*   **Definition**: A list of independent, specific queries derived from the user's original request.
*   **Strategy**:
    *   **Decompose**: Break down complex user questions into smaller, atomic sub-questions.
    *   **Keywords & Concepts**: extracting core entities and concepts.
    *   **Synonyms**: Include variations of technical terms to capture different phrasings.
    *   **Contextual**: If the user refers to "it" or "that", resolve the reference in the generated queries.

**Example**:
*   *User*: "How does the auth system work and how is it different from the old legacy one?"
*   *multiHopQueries*:
    *   "authentication system architecture"
    *   "current auth implementation details"
    *   "legacy authentication system features"
    *   "differences between new and legacy auth systems"

#### 2. `queryRewriting` (String)
This parameter is used for re-ranking the results to ensure the most semantically relevant chunks are prioritized.

*   **Definition**: A single, comprehensive query that captures the core semantic meaning of the user's intent.
*   **Strategy**:
    *   Should be a well-formed sentence or phrase.
    *   Should encompass the entire scope of the user's question.
    *   Avoid noise words; focus on semantic density.

**Example**:
*   *queryRewriting*: "Comparison of modern authentication system architecture versus legacy authentication implementation."

## Best Practices

1.  **Be Exhaustive but Precise**: Generate enough queries (3-5) to cover different angles, but avoid generic queries like "code" or "system" which return too much noise.
2.  **Handling "No Results"**: If a search returns no useful information, consider that the information might not exist in the uploaded resources.
