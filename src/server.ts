import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  AVAILABLE_AGENTS,
  type AvailableAgentName,
  getAgentConfig,
  getAgentEnumDescription,
  getToolDescription,
} from "./agents";
import { callModel } from "./providers";

const server = new McpServer({
  name: "impart-mcp",
  version: "1.0.0",
});

type TaskStatus = "running" | "completed" | "error";

interface TaskResult {
  status: TaskStatus;
  agent: string;
  model?: string;
  response?: string;
  usage?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

const tasks = new Map<string, TaskResult>();

function generateTaskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

async function executeAgentTask(
  taskId: string,
  agent: AvailableAgentName,
  cwd: string,
  prompt: string,
  context?: string
): Promise<void> {
  const config = getAgentConfig(agent);
  const userPrompt = context
    ? `${prompt}\n\n---\nContext:\n${context}`
    : prompt;

  try {
    const result = await callModel(
      cwd,
      config.model,
      config.systemPrompt,
      userPrompt,
      {
        temperature: config.temperature,
        readOnly: config.readOnly,
      }
    );

    const task = tasks.get(taskId);
    if (task && task.status === "running") {
      task.status = "completed";
      task.model = config.model;
      task.response = result.text;
      task.usage = result.usage;
      task.endTime = Date.now();
      console.error(
        `[${taskId}] COMPLETED ${agent} (${task.endTime - task.startTime}ms)`
      );
    }
  } catch (error) {
    const task = tasks.get(taskId);
    if (task && task.status === "running") {
      task.status = "error";
      task.error = error instanceof Error ? error.message : String(error);
      task.endTime = Date.now();
      console.error(`[${taskId}] ERROR ${agent}: ${task.error}`);
    }
  }
}

server.registerTool(
  "call_agent",
  {
    description: getToolDescription(),
    inputSchema: {
      agent: z.enum(AVAILABLE_AGENTS).describe(getAgentEnumDescription()),
      prompt: z.string().describe("The prompt/task for the agent"),
      cwd: z.string().describe("Working directory for the agent (required)"),
      context: z.string().optional().describe("Additional context"),
      images: z
        .array(z.string())
        .optional()
        .describe("Base64 encoded images (only for multimodal-looker)"),
    },
  },
  async (input: {
    agent: AvailableAgentName;
    prompt: string;
    cwd: string;
    context?: string;
    images?: string[];
  }) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).slice(2, 6);
    console.error(
      `[${requestId}] START ${input.agent} @ ${new Date().toISOString()}`
    );

    try {
      const config = getAgentConfig(input.agent);

      const userPrompt = input.context
        ? `${input.prompt}\n\n---\nContext:\n${input.context}`
        : input.prompt;

      const result = await callModel(
        input.cwd,
        config.model,
        config.systemPrompt,
        userPrompt,
        {
          temperature: config.temperature,
          readOnly: config.readOnly,
        }
      );

      console.error(
        `[${requestId}] END ${input.agent} @ ${new Date().toISOString()} (${
          Date.now() - startTime
        }ms)`
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
      console.error(
        `[${requestId}] ERROR ${input.agent} @ ${new Date().toISOString()} (${
          Date.now() - startTime
        }ms): ${errorMessage}`
      );
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

server.registerTool(
  "call_agent_async",
  {
    description: `Start agent task in background (NON-BLOCKING). Returns task_id immediately.

## ✅ Recommended for explore/researcher

**Workflow:**
1. \`call_agent_async\` → get task_id instantly
2. Continue your work (read files, think, etc.)
3. \`get_agent_result(task_id, block=true)\` when ready

**Why async is better:**
- No wasted waiting time
- Can launch multiple searches in parallel
- Check results when YOU need them

**Parallel search pattern:**
\`\`\`
call_agent_async(explore, "Find X") → task_1
call_agent_async(researcher, "Find Y") → task_2
... do other work ...
get_agent_result(task_1, block=false)
get_agent_result(task_2, block=false)
... do other work ...
get_agent_result(task_1, block=true)
get_agent_result(task_2, block=true)
\`\`\``,
    inputSchema: {
      agent: z.enum(AVAILABLE_AGENTS).describe(getAgentEnumDescription()),
      prompt: z.string().describe("The prompt/task for the agent"),
      cwd: z.string().describe("Working directory for the agent"),
      context: z.string().optional().describe("Additional context"),
    },
  },
  async (input: {
    agent: AvailableAgentName;
    prompt: string;
    cwd: string;
    context?: string;
  }) => {
    const taskId = generateTaskId();
    const config = getAgentConfig(input.agent);

    const task: TaskResult = {
      status: "running",
      agent: config.displayName,
      startTime: Date.now(),
    };
    tasks.set(taskId, task);

    console.error(`[${taskId}] ASYNC START ${input.agent}`);

    executeAgentTask(
      taskId,
      input.agent,
      input.cwd,
      input.prompt,
      input.context
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            task_id: taskId,
            agent: config.displayName,
            status: "running",
          }),
        },
      ],
    };
  }
);

server.registerTool(
  "get_agent_result",
  {
    description: `Get result from async agent task.

Parameters:
- task_id: The task ID from call_agent_async
- block: If true, wait for completion (default: false)
- timeout: Max wait time in ms when blocking (default: 300000 = 5min)

Returns task status and result if completed.`,
    inputSchema: {
      task_id: z.string().describe("Task ID from call_agent_async"),
      block: z
        .boolean()
        .optional()
        .describe("Wait for completion (default: false)"),
      timeout: z
        .number()
        .optional()
        .describe("Max wait time in ms (default: 300000)"),
    },
  },
  async (input: { task_id: string; block?: boolean; timeout?: number }) => {
    const task = tasks.get(input.task_id);

    if (!task) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: "Task not found",
              task_id: input.task_id,
            }),
          },
        ],
        isError: true,
      };
    }

    if (input.block && task.status === "running") {
      const timeout = input.timeout ?? 300000;
      const startWait = Date.now();

      while (task.status === "running" && Date.now() - startWait < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const result: Record<string, unknown> = {
      task_id: input.task_id,
      status: task.status,
      agent: task.agent,
    };

    if (task.status === "completed") {
      result.model = task.model;
      result.response = task.response;
      result.usage = task.usage;
      result.duration = task.endTime! - task.startTime;
    } else if (task.status === "error") {
      result.error = task.error;
      result.duration = task.endTime! - task.startTime;
    } else if (task.status === "running") {
      result.elapsed = Date.now() - task.startTime;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

const agentCallSchema = z.object({
  agent: z.enum(AVAILABLE_AGENTS).describe(getAgentEnumDescription()),
  prompt: z.string(),
  context: z.string().optional(),
  images: z.array(z.string()).optional(),
});

server.registerTool(
  "call_agents_batch",
  {
    description: `Execute multiple agents in PARALLEL (BLOCKING until ALL complete).

## ⚠️ Usually NOT what you want

**Prefer \`call_agent_async\` × N instead:**
- Async returns immediately, you can continue working
- Batch blocks until the SLOWEST agent finishes
- If one agent takes 2min, you wait 2min doing nothing

**Only use batch when:**
- You MUST have ALL results before ANY next step
- Results are interdependent (rare)
- You're okay blocking for potentially minutes

**Example (usually wrong):**
\`\`\`json
{ "calls": [{ "agent": "explore", ... }, { "agent": "researcher", ... }] }
\`\`\`
↑ This blocks until both finish. Use call_agent_async × 2 instead.

**Example (correct use case):**
Comparing outputs from multiple agents where you need all results simultaneously.`,
    inputSchema: {
      cwd: z.string().describe("Working directory for all agents (required)"),
      calls: z
        .array(agentCallSchema)
        .min(1)
        .max(10)
        .describe("Array of agent calls to execute in parallel (1-10 calls)"),
    },
  },
  async (input: {
    cwd: string;
    calls: Array<{
      agent: AvailableAgentName;
      prompt: string;
      context?: string;
      images?: string[];
    }>;
  }) => {
    const batchId = Math.random().toString(36).slice(2, 6);
    const startTime = Date.now();
    console.error(
      `[${batchId}] BATCH START (${
        input.calls.length
      } calls) @ ${new Date().toISOString()}`
    );

    const executeAgent = async (
      call: (typeof input.calls)[0],
      index: number
    ) => {
      const callId = `${batchId}-${index}`;
      const callStart = Date.now();
      console.error(
        `[${callId}] START ${call.agent} @ ${new Date().toISOString()}`
      );

      try {
        const config = getAgentConfig(call.agent);
        const userPrompt = call.context
          ? `${call.prompt}\n\n---\nContext:\n${call.context}`
          : call.prompt;

        const result = await callModel(
          input.cwd,
          config.model,
          config.systemPrompt,
          userPrompt,
          {
            temperature: config.temperature,
            readOnly: config.readOnly,
          }
        );

        console.error(
          `[${callId}] END ${call.agent} @ ${new Date().toISOString()} (${
            Date.now() - callStart
          }ms)`
        );

        return {
          agent: config.displayName,
          model: config.model,
          response: result.text,
          usage: result.usage,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[${callId}] ERROR ${call.agent} @ ${new Date().toISOString()} (${
            Date.now() - callStart
          }ms): ${errorMessage}`
        );
        return {
          agent: call.agent,
          error: errorMessage,
        };
      }
    };

    const results = await Promise.all(
      input.calls.map((call, index) => executeAgent(call, index))
    );

    console.error(
      `[${batchId}] BATCH END @ ${new Date().toISOString()} (${
        Date.now() - startTime
      }ms)`
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            batchId,
            totalTime: Date.now() - startTime,
            results,
          }),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("impart-mcp running on stdio");
