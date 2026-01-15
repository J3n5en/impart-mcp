// import { generateText } from "ai";
// import { createClaudeCode } from "ai-sdk-provider-claude-code";
// import { codexCli } from "ai-sdk-provider-codex-cli";

// const model = codexCli("gpt-5.2-codex", {
//   reasoningEffort: "medium",
//   approvalMode: "never",
//   sandboxMode: "read-only",
//   cwd: ".",
//   verbose: true,
//   allowNpx: true,
//   skipGitRepoCheck: true,
//   webSearch: true,
// });

// const claudeProvider = createClaudeCode({
//   defaultSettings: {
//     cwd: ".",
//   },
// });

// const { text } = await generateText({
//   model: claudeProvider("haiku"),
//   prompt: "写一个你的自我介绍到 README.md",
// });

// console.log(text);

import { streamText } from "ai";
import { claudeCode } from "ai-sdk-provider-claude-code";

const result = streamText({
  model: claudeCode("haiku", {
    settingSources: ["user", "project", "local"],
  }),
  prompt: "Hello, Claude!",
});

const text = await result.text;
console.log(text);
