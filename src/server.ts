import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  AVAILABLE_AGENTS,
  getAgentConfig,
  TOOL_DESCRIPTION,
  START_TASK_DESCRIPTION,
  type AvailableAgentName,
} from "./agents";
import { callModel } from "./providers";
import { taskManager } from "./task-manager";

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

// 启动后台任务
server.tool(
  "start_task",
  START_TASK_DESCRIPTION,
  {
    agent: z
      .enum(AVAILABLE_AGENTS)
      .describe("The agent to use"),
    prompt: z.string().describe("The prompt/task for the agent"),
    cwd: z.string().optional().describe("Working directory"),
    context: z.string().optional().describe("Additional context"),
  },
  async (input: {
    agent: AvailableAgentName;
    prompt: string;
    cwd?: string;
    context?: string;
  }) => {
    const task = taskManager.create(input.agent, input.prompt);
    const config = getAgentConfig(input.agent);
    const cwd = input.cwd || process.cwd();

    const userPrompt = input.context
      ? `${input.prompt}\n\n---\nContext:\n${input.context}`
      : input.prompt;

    // 异步执行，不等待
    (async () => {
      taskManager.setRunning(task.id);
      try {
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
        taskManager.setCompleted(task.id, {
          response: result.text,
          model: config.model,
          usage: result.usage,
        });
      } catch (error) {
        taskManager.setFailed(
          task.id,
          error instanceof Error ? error.message : String(error)
        );
      }
    })();

    // 立即返回 task_id
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            task_id: task.id,
            agent: config.displayName,
            status: "started",
            message: "Task started in background. Use get_task_status or get_task_result to check progress.",
          }),
        },
      ],
    };
  }
);

// 查询任务状态
server.tool(
  "get_task_status",
  "Get the status of a background task. Returns status (pending/running/completed/failed) and basic info.",
  {
    task_id: z.string().describe("The task ID returned by start_task"),
  },
  async (input: { task_id: string }) => {
    const task = taskManager.get(input.task_id);

    if (!task) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "Task not found", task_id: input.task_id }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            task_id: task.id,
            agent: task.agent,
            status: task.status,
            created_at: new Date(task.createdAt).toISOString(),
            completed_at: task.completedAt
              ? new Date(task.completedAt).toISOString()
              : null,
            has_result: !!task.result,
            has_error: !!task.error,
          }),
        },
      ],
    };
  }
);

// 获取任务结果
server.tool(
  "get_task_result",
  "Get the full result of a completed background task. Includes the response text, model used, and token usage.",
  {
    task_id: z.string().describe("The task ID returned by start_task"),
  },
  async (input: { task_id: string }) => {
    const task = taskManager.get(input.task_id);

    if (!task) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "Task not found", task_id: input.task_id }),
          },
        ],
        isError: true,
      };
    }

    if (task.status === "pending" || task.status === "running") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              task_id: task.id,
              status: task.status,
              message: "Task is still running. Try again later.",
            }),
          },
        ],
      };
    }

    if (task.status === "failed") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              task_id: task.id,
              status: "failed",
              error: task.error,
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            task_id: task.id,
            agent: task.agent,
            status: "completed",
            result: task.result,
          }),
        },
      ],
    };
  }
);

// 列出所有任务
server.tool(
  "list_tasks",
  "List all background tasks with their status. Useful to see what's running and what's completed.",
  {},
  async () => {
    const tasks = taskManager.list().map((t) => ({
      task_id: t.id,
      agent: t.agent,
      status: t.status,
      created_at: new Date(t.createdAt).toISOString(),
      prompt_preview: t.prompt.slice(0, 100) + (t.prompt.length > 100 ? "..." : ""),
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ tasks, count: tasks.length }),
        },
      ],
    };
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
