import { generateText, type LanguageModel } from "ai";
import { createClaudeCode } from "ai-sdk-provider-claude-code";
import { createCodexCli } from "ai-sdk-provider-codex-cli";
import { createGeminiCli } from "ai-sdk-provider-gemini-cli-agentic";
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
      `Unknown provider: "${provider}". Available: ${VALID_PROVIDERS.join(
        ", "
      )}`
    );
  }

  return { provider: provider as ProviderType, modelName };
}

const CLAUDE_READ_ONLY_TOOLS = ["Write", "Edit", "Bash", "Delete"];

function createModel(
  cwd: string,
  modelId: string,
  readOnly?: boolean
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
          sandboxMode: readOnly ? "read-only" : "workspace-write",
        },
      });
      return codexProvider(modelName);
    }
    case "claude": {
      const claudeProvider = createClaudeCode({
        defaultSettings: {
          cwd,
          settingSources: ["user", "project", "local"],
          ...(readOnly && { disallowedTools: CLAUDE_READ_ONLY_TOOLS }),
        },
      });
      return claudeProvider(modelName);
    }
    case "gemini": {
      const geminiProvider = createGeminiCli({
        defaultSettings: {
          cwd,
          approvalMode: readOnly ? "default" : "yolo",
        },
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
    readOnly?: boolean;
  }
): Promise<{
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  const model = createModel(cwd, modelId, options?.readOnly);

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: options?.temperature,
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
