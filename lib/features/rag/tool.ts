import { tool, ToolSet, UIMessage } from "ai";
import { z } from "zod";
import { QUERY_TYPES, RagChunk } from "./types";
import { retrieveResources } from "./retrieve/search";
import { extractResourceIdsFromMessages } from "./extract-resource-ids";
import { RAG_TOOL } from "@/lib/features/rag/constants";

export interface RagFactoryArgs {
  messages: UIMessage[];
  userId: string;
  projectId?: string;
  ragMaxResources?: number;
}

export const ragFactory = ({
  userId,
  projectId,
  messages,
  ragMaxResources = 6,
}: RagFactoryArgs) =>
  ({
    [RAG_TOOL]: tool({
      description: `
        Retrieves information from the knowledge base. Use for questions, code examples, or documentation clarification.

        CRITICAL: Decompose the request into distinct, fundamental core concepts. Generate parallel, self-contained search queries where each query focuses on a single concept (3 maximum). Queries MUST be in English.
      `,
      inputSchema: z.object({
        queries: z.array(z.string()).min(1).max(3).describe(`
            Identify one to three distinct core subjects or entities from the user's request. **Order them by relevance/importance to the user's goal.**

            For each subject, generate a targeted, standalone search query following these rules:

            1. **Quantity Limit**: Generate a MAXIMUM of 3 queries. If more than 3 concepts exist, prioritize the top 3 most critical ones.
            2. **Atomic & Isolated Scope**: Strictly isolate distinct technologies, frameworks, or domains. A query describing one core subject MUST NOT mention other core subjects from the request. Example:
               - ** Idenfied Core Contepts**: Node.js and Redis
               - **BAD**: "Optimizing Node.js APIs for Redis caching" (Mixes Node.js and Redis)
               - **GOOD**: Query 1: "Node.js API optimization techniques", Query 2: "Redis caching patterns"
            3. **Descriptive**: Generate detailed, self-contained queries for each isolated subject. Fully capture the semantic depth and constraints of the user's intent, resolving all implicit references (pronouns).
            4. **Language**: Queries MUST be in English.

            **Example 1**:
            User: *"I need to implement a secure webhook handler in my Node.js Express server to listen for Stripe 'payment_intent.succeeded' events. The handler must verify the Stripe signature to prevent spoofing and then update the user's subscription status in the database asynchronously."*

            **Identified Concepts (Ordered by Relevance):**
            1. **Stripe Webhooks** (Primary Trigger/Event)
            2. **Express.js** (Implementation Context)

            Queries:
            1. "Documentation on verifying signatures and parsing event payloads for Stripe webhooks."
            2. "Guide to configuring middleware and secure route handlers for asynchronous events in Express.js applications."

            **Example 2**:
            User: *"I need to build a shopping cart feature in React that uses Redux Toolkit for global state management (add/remove items) and fully test the logic with Jest."*

            **Identified Concepts (Ordered by Relevance):**
            1. **Redux Toolkit** (Core State Logic)
            2. **Jest** (Testing Requirement)
            3. **React** (UI Context)

            Queries:
            1. "Guide to configuring Redux Toolkit slices and selectors for managing global application state."
            2. "Documentation and examples for writing unit tests for Javascript state logic and components using Jest."
            3. "Best practices for building responsive shopping cart user interfaces and component structures in React."

            **Example 3 (Constraint Handling)**:
            User: *"I want to build a full stack app using Next.js, Tailwind CSS, Supabase for auth and DB, Stripe for payments, and deploy it to Vercel with a Redis cache."*

            **Identified Concepts (Prioritized Top 3):**
            1. **Next.js** (Core Framework)
            2. **Supabase** (Backend Infrastructure)
            3. **Stripe** (Critical Integration)
            *(Tailwind, Vercel, and Redis are omitted to strictly adhere to the 3-query limit)*

            Queries:
            1. "Guide to building full stack applications with Next.js App Router and server components."
            2. "Documentation on setting up authentication and database schemas with Supabase."
            3. "Integration guide for processing payments with Stripe in a Next.js application."
          `),
        queryType: z
          .enum(QUERY_TYPES)
          .default("RETRIEVAL_QUERY")
          .describe(
            "Classify the intent: use 'CODE_RETRIEVAL_QUERY' ONLY if the user explicitly asks for code snippets, implementation examples, or syntax. Use 'RETRIEVAL_QUERY' for concepts, debugging, architectural questions, or general knowledge.",
          ),
      }),
      outputSchema: z.array(
        z.object({
          id: z.string().describe("Embedding ID of the chunk."),
          content: z.string().describe("The content of the chunk."),
          resourceTitle: z.string().describe("The title of the resource."),
          resourceUrl: z
            .string()
            .nullable()
            .describe("The URL of the resource."),
        }),
      ),
      execute: async ({ queries, queryType }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with queries:", queries);
        console.log("RAG tool called with queryType:", queryType);

        const resources = await retrieveResources({
          queries,
          queryType,
          previousResources: [...extractResourceIdsFromMessages(messages)],
          userId,
          projectId,
          limit: ragMaxResources,
        });

        return resources;
      },
    }),
  }) satisfies ToolSet;

export type RagTool = ReturnType<typeof ragFactory>;
