#!/usr/bin/env -S npx tsx
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/infrastructure/db/db";
import { userApiKey } from "../lib/infrastructure/db/schema";
import { retrieveResourceChunks } from "../lib/features/rag/retrieve/search";

// Initialize MCP Server
const server = new Server(
  {
    name: "ai-chatbot-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Validate the API Key and resolve User ID
 */
async function authenticate(apiKey: string) {
  const [result] = await getDb()
    .select({ userId: userApiKey.userId })
    .from(userApiKey)
    .where(eq(userApiKey.key, apiKey))
    .limit(1);

  if (!result) {
    throw new Error("Invalid API Key");
  }

  return result.userId;
}

// Tool Definition
const RETRIEVE_TOOL = {
  name: "retrieve_resource_chunks",
  description:
    "Search for relevant information chunks from the user's resources using multi-hop queries.",
  inputSchema: {
    type: "object",
    properties: {
      multiHopQueries: {
        type: "array",
        items: { type: "string" },
        description: "A list of queries to search for.",
      },
      queryRewriting: {
        type: "string",
        description: "Re-written query for reranking.",
      },
    },
    required: ["multiHopQueries", "queryRewriting"],
  },
};

// Register List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [RETRIEVE_TOOL],
  };
});

// Register Call Tool
server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const apiKey = process.env.MCP_API_KEY;
    if (!apiKey) {
      return {
        content: [
          {
            type: "text",
            text: "Error: MCP_API_KEY environment variable is not set.",
          },
        ],
        isError: true,
      };
    }

    try {
      const userId = await authenticate(apiKey);

      if (request.params.name === "retrieve_resource_chunks") {
        const { multiHopQueries, queryRewriting } = z
          .object({
            multiHopQueries: z.array(z.string()),
            queryRewriting: z.string(),
          })
          .parse(request.params.arguments);

        const chunks = await retrieveResourceChunks({
          multiHopQueries,
          queryRewriting,
          previousResources: [], // In MCP context we might not have previous message history easily available
          userId,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                chunks.map(({ resourceTitle, resourceUrl, content }) => ({
                  resourceTitle,
                  resourceUrl,
                  content,
                })),
                null,
                2,
              ),
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  },
);

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server started");
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
