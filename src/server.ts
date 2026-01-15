import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  AVAILABLE_AGENTS,
  getAgentConfig,
  TOOL_DESCRIPTION,
  type AvailableAgentName,
} from "./agents";
import { callModel } from "./providers";

const server = new McpServer({
  name: "multi-agent-mcp",
  version: "1.0.0",
});

server.tool(
  "call_agent",
  TOOL_DESCRIPTION,
  {
    agent: z
      .enum(AVAILABLE_AGENTS)
      .describe(
        "The agent to use: oracle | librarian | explore | frontend-ui-ux-engineer | document-writer | multimodal-looker"
      ),
    prompt: z.string().describe("The prompt/task for the agent"),
    cwd: z.string().optional().describe("Working directory for the agent (defaults to process.cwd())"),
    context: z.string().optional().describe("Additional context"),
    images: z
      .array(z.string())
      .optional()
      .describe("Base64 encoded images (only for multimodal-looker)"),
  },
  async (input: {
    agent: AvailableAgentName;
    prompt: string;
    cwd?: string;
    context?: string;
    images?: string[];
  }) => {
    try {
      const config = getAgentConfig(input.agent);
      const cwd = input.cwd || process.cwd();

      const userPrompt = input.context
        ? `${input.prompt}\n\n---\nContext:\n${input.context}`
        : input.prompt;

      const result = await callModel(
        cwd,
        config.model,
        config.systemPrompt,
        userPrompt,
        {
          temperature: config.temperature,
          denyTools: config.denyTools,
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              agent: config.displayName,
              model: config.model,
              response: result.text,
              usage: result.usage,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              agent: input.agent,
              error: errorMessage,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Multi-Agent MCP Server running on stdio...");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
