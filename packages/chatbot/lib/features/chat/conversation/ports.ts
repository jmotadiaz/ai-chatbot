import type { ToolLoopAgent, ToolSet } from "ai";
import type { CreateAgentOptions, ModelConfiguration } from "inference";

export interface ChatAgentAiPort {
  /**
   * Resolved Model Configuration for the user-selected model, chat-level
   * temperature/topP/topK overrides applied — used where a mode needs the
   * model itself rather than a `ToolLoopAgent`: the Context7 branch
   * (`Context7Agent` is a different, third-party agent class) and message
   * processing's `reasoning` flag (`chat-modes/utils.ts`'s
   * `withMessageProcessing`).
   */
  getModelConfiguration(): ModelConfiguration;
  /**
   * Builds a `ToolLoopAgent` for the (fixed) user-selected model through the
   * kit's `createAgent`, with the chat-level temperature/topP/topK overrides
   * already folded in; each Chat Mode supplies its own instructions/tools/
   * overrides on top (a mode's own override wins on conflict). Not generic
   * like the kit's own `createAgent`: no caller here needs a narrower `TOOLS`
   * type than the default `ToolSet` back from the port.
   */
  createAgent(options: CreateAgentOptions): ToolLoopAgent<never, ToolSet>;
}
