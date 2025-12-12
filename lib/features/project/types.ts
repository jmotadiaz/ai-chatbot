import { z } from "zod";
import { Project, InsertProject } from "@/lib/db/schema";
import { CHAT_MODELS } from "@/lib/features/models/constants";

// Re-export database types
export type { Project, InsertProject };

// Zod schema for Project validation
export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  defaultModel: z.enum(CHAT_MODELS as [string, ...string[]]).optional(),
  defaultTemperature: z.number().min(0).max(2).optional(),
  defaultTopP: z.number().min(0).max(1).optional(),
  defaultTopK: z.number().min(0).optional(),
  ragMaxResources: z.number().min(1).optional(),
  webSearchNumResults: z.number().min(1).optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  hasPromptRefiner: z.boolean().default(false),
  tools: z.array(z.string()).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
