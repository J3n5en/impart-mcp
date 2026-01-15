import type { AvailableAgentName } from "./agents";

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface TaskInfo {
  id: string;
  agent: AvailableAgentName;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  result?: {
    response: string;
    model: string;
    usage?: { inputTokens: number; outputTokens: number };
  };
  error?: string;
}

class TaskManager {
  private tasks = new Map<string, TaskInfo>();

  generateId(): string {
    return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  create(agent: AvailableAgentName, prompt: string): TaskInfo {
    const task: TaskInfo = {
      id: this.generateId(),
      agent,
      prompt,
      status: "pending",
      createdAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): TaskInfo | undefined {
    return this.tasks.get(id);
  }

  setRunning(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.status = "running";
  }

  setCompleted(
    id: string,
    result: { response: string; model: string; usage?: { inputTokens: number; outputTokens: number } }
  ): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = "completed";
      task.completedAt = Date.now();
      task.result = result;
    }
  }

  setFailed(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = "failed";
      task.completedAt = Date.now();
      task.error = error;
    }
  }

  list(): TaskInfo[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  // 清理超过 1 小时的已完成任务
  cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, task] of this.tasks) {
      if (task.completedAt && task.completedAt < oneHourAgo) {
        this.tasks.delete(id);
      }
    }
  }
}

export const taskManager = new TaskManager();
