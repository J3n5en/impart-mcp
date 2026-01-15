import { generateText, type LanguageModel } from "ai";
import { createCodexCli } from "ai-sdk-provider-codex-cli";
import { createClaudeCode } from "ai-sdk-provider-claude-code";
import { createGeminiProvider } from "ai-sdk-provider-gemini-cli";
import type { ProviderType } from "../types";

type ModelConfig = {
  provider: ProviderType;
  codexModel?: string;
  claudeModel?: string;
  geminiModel?: string;
};

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "gpt-5.2": { provider: "codex", codexModel: "gpt-5.2" },
  "gpt-5.1-codex": { provider: "codex", codexModel: "gpt-5.1-codex" },
  "gpt-5.1-codex-max": { provider: "codex", codexModel: "gpt-5.1-codex-max" },
  "claude-opus": { provider: "claude", claudeModel: "opus" },
  "claude-sonnet": { provider: "claude", claudeModel: "sonnet" },
  "claude-haiku": { provider: "claude", claudeModel: "haiku" },
  "gemini-3-pro": { provider: "gemini", geminiModel: "gemini-3-pro-preview" },
  "gemini-3-flash": { provider: "gemini", geminiModel: "gemini-3-flash-preview" },
};

function mapToClaudeDisallowedTools(denyTools?: string[]): string[] | undefined {
  if (!denyTools || denyTools.length === 0) return undefined;
  
  const mapping: Record<string, string> = {
    write: "Write",
    edit: "Edit",
    bash: "Bash",
    delete: "Delete",
  };
  
  return denyTools.map((tool) => mapping[tool.toLowerCase()] || tool);
}

function getCodexSandboxMode(denyTools?: string[]): "read-only" | "workspace-write" {
  if (!denyTools) return "workspace-write";
  const hasWriteRestriction = denyTools.some((t) =>
    ["write", "edit"].includes(t.toLowerCase())
  );
  return hasWriteRestriction ? "read-only" : "workspace-write";
}

function createModel(
  cwd: string,
  modelId: string,
  denyTools?: string[]
): LanguageModel {
  const config = MODEL_CONFIGS[modelId];
  if (!config) {
    throw new Error(`Unknown model: ${modelId}. Available: ${Object.keys(MODEL_CONFIGS).join(", ")}`);
  }

  switch (config.provider) {
    case "codex": {
      const provider = createCodexCli({
        defaultSettings: {
          cwd,
          allowNpx: true,
          skipGitRepoCheck: true,
          approvalMode: "never",
          sandboxMode: getCodexSandboxMode(denyTools),
        },
      });
      return provider(config.codexModel!);
    }
    case "claude": {
      const disallowedTools = mapToClaudeDisallowedTools(denyTools);
      const provider = createClaudeCode({
        defaultSettings: {
          cwd,
          settingSources: ["user", "project", "local"],
          ...(disallowedTools && { disallowedTools }),
        },
      });
      return provider(config.claudeModel!);
    }
    case "gemini": {
      const provider = createGeminiProvider({
        authType: "oauth-personal",
      });
      return provider(config.geminiModel!);
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

function extractTokenCount(
  tokens: number | { total?: number } | undefined
): number {
  if (typeof tokens === "number") return tokens;
  if (tokens && typeof tokens === "object" && "total" in tokens) {
    return tokens.total ?? 0;
  }
  return 0;
}

export async function callModel(
  cwd: string,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    denyTools?: string[];
  }
): Promise<{
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  const model = createModel(cwd, modelId, options?.denyTools);
  const config = MODEL_CONFIGS[modelId];
  const isGemini = config?.provider === "gemini";

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: options?.temperature,
    ...(isGemini && { toolChoice: "none" as const }),
  });

  const finishReason = result.steps?.[0]?.finishReason;
  const rawFinishReason = result.steps?.[0]?.rawFinishReason;
  
  if (!result.text && finishReason !== "stop") {
    throw new Error(
      `Model returned empty response. finishReason: ${finishReason}, rawFinishReason: ${rawFinishReason}`
    );
  }

  return {
    text: result.text,
    usage: {
      inputTokens: extractTokenCount(result.usage?.inputTokens),
      outputTokens: extractTokenCount(result.usage?.outputTokens),
    },
  };
}
