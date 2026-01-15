import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  AVAILABLE_AGENTS,
  getAgentConfig,
  TOOL_DESCRIPTION,
  type AvailableAgentName,
} from "./agents";
import { callModel } from "./providers";

const PORT = 3456;

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
    const startTime = Date.now();
    const requestId = Math.random().toString(36).slice(2, 6);
    console.error(`[${requestId}] START ${input.agent} @ ${new Date().toISOString()}`);
    
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

      console.error(`[${requestId}] END ${input.agent} @ ${new Date().toISOString()} (${Date.now() - startTime}ms)`);
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
      console.error(`[${requestId}] ERROR ${input.agent} @ ${new Date().toISOString()} (${Date.now() - startTime}ms): ${errorMessage}`);
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

const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    const sessionId = req.headers.get("mcp-session-id");
    let transport: WebStandardStreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId)!;
    } else if (req.method === "POST" || req.method === "GET") {
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport);
          console.error(`Session initialized: ${id}`);
        },
      });
      
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
          console.error(`Session closed: ${transport.sessionId}`);
        }
      };

      await server.connect(transport);
    } else {
      return new Response("Session not found", { status: 404 });
    }

    return transport.handleRequest(req);
  },
});

console.error(`Multi-Agent MCP Server running on http://localhost:${PORT}/mcp`);
