import { z } from "zod";

export type AgentName =
  | "sisyphus"
  | "oracle"
  | "librarian"
  | "explore"
  | "frontend-ui-ux-engineer"
  | "document-writer"
  | "multimodal-looker";

export type AgentMode = "primary" | "subagent";

export type ProviderType = "codex" | "claude" | "gemini";

export interface AgentConfig {
  name: AgentName;
  displayName: string;
  description: string;
  mode: AgentMode;
  provider: ProviderType;
  model: string;
  systemPrompt: string;
  temperature?: number;
  denyTools?: string[];
  allowTools?: string[];
}

export const AgentInputSchema = z.object({
  prompt: z.string().describe("The prompt/task for the agent"),
  context: z.string().optional().describe("Additional context or file paths"),
  images: z
    .array(z.string())
    .optional()
    .describe("Base64 encoded images (for multimodal-looker)"),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

export interface AgentResponse {
  text: string;
  agent: AgentName;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface McpToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}
