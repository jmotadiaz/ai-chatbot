import { z } from "zod";
import { Project, InsertProject } from "@/lib/infrastructure/db/schema";

// Re-export database types
export type { Project, InsertProject };

// Zod schema for Project validation
// defaultModel es free-form (varchar): la validez contra el catálogo se
// resuelve en runtime con resolveChatModelId al leerla.
export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  defaultModel: z.string().optional(),
  defaultTemperature: z.number().min(0).max(2).optional(),
  defaultTopP: z.number().min(0).max(1).optional(),
  defaultTopK: z.number().min(0).optional(),

  webSearchNumResults: z.number().min(1).optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  hasPromptRefiner: z.boolean().default(false),
  tools: z.array(z.string()).optional(),
  isActive: z.boolean().default(false),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
