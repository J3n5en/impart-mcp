import { generateText } from "ai";
import { codexCli } from "ai-sdk-provider-codex-cli";

const model = codexCli("gpt-5.2-codex", {
  reasoningEffort: "medium",
  approvalMode: "never",
  sandboxMode: "read-only",
  cwd: ".",
  verbose: true,
  allowNpx: true,
  skipGitRepoCheck: true,
  webSearch: true,
});

const { text } = await generateText({
  model,
  prompt: "写一个你的自我介绍到 README.md",
});

console.log(text);
