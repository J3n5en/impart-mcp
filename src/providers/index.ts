import { generateText, type LanguageModel } from "ai";
import { createCodexCli } from "ai-sdk-provider-codex-cli";
import { createClaudeCode } from "ai-sdk-provider-claude-code";
import { createGeminiProvider } from "ai-sdk-provider-gemini-cli";
import type { ProviderType } from "../types";

const VALID_PROVIDERS: ProviderType[] = ["codex", "claude", "gemini"];

type ParsedModel = { provider: ProviderType; modelName: string };

function parseModelId(modelId: string): ParsedModel {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format: "${modelId}". Use "provider/model" (e.g., "codex/gpt-5.2", "claude/sonnet")`
    );
  }

  const provider = modelId.slice(0, slashIndex);
  const modelName = modelId.slice(slashIndex + 1);

  if (!modelName) {
    throw new Error(`Missing model name in: "${modelId}"`);
  }

  if (!VALID_PROVIDERS.includes(provider as ProviderType)) {
    throw new Error(
      `Unknown provider: "${provider}". Available: ${VALID_PROVIDERS.join(", ")}`
    );
  }

  return { provider: provider as ProviderType, modelName };
}

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
  const { provider, modelName } = parseModelId(modelId);

  switch (provider) {
    case "codex": {
      const codexProvider = createCodexCli({
        defaultSettings: {
          cwd,
          allowNpx: true,
          skipGitRepoCheck: true,
          approvalMode: "never",
          sandboxMode: getCodexSandboxMode(denyTools),
        },
      });
      return codexProvider(modelName);
    }
    case "claude": {
      const disallowedTools = mapToClaudeDisallowedTools(denyTools);
      const claudeProvider = createClaudeCode({
        defaultSettings: {
          cwd,
          settingSources: ["user", "project", "local"],
          ...(disallowedTools && { disallowedTools }),
        },
      });
      return claudeProvider(modelName);
    }
    case "gemini": {
      const geminiProvider = createGeminiProvider({
        authType: "oauth-personal",
      });
      return geminiProvider(modelName);
    }
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
  const { provider } = parseModelId(modelId);
  const isGemini = provider === "gemini";

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
