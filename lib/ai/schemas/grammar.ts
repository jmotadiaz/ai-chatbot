import { z } from "zod";

export const grammarSchema = z.object({
  correctedText: z.string().describe("Text corrected grammatically."),
  reasons: z.array(z.string().describe("Reason of the change.")),
});
