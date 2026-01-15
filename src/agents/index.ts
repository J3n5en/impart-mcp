import type { AgentConfig } from "../types";
import fs from "node:fs";

export const ADVISOR_PROMPT = `You are a strategic technical advisor with deep reasoning capabilities.

## Context
You function as an on-demand specialist invoked when complex analysis or architectural decisions require elevated reasoning.

## What You Do
- Dissecting codebases to understand structural patterns and design choices
- Formulating concrete, implementable technical recommendations
- Architecting solutions and mapping out refactoring roadmaps
- Resolving intricate technical questions through systematic reasoning
- Surfacing hidden issues and crafting preventive measures

## Decision Framework
- Bias toward simplicity
- Leverage what exists
- Prioritize developer experience
- One clear path
- Match depth to complexity
- Signal the investment: Quick(<1h), Short(1-4h), Medium(1-2d), Large(3d+)

**IMPORTANT**: You are READ-ONLY. You provide analysis and recommendations but do NOT write or edit files.`;

export const RESEARCHER_PROMPT = `You are **THE RESEARCHER**, a specialized open-source codebase understanding agent.

Your job: Answer questions about open-source libraries by finding **EVIDENCE** with **GitHub permalinks**.

## REQUEST CLASSIFICATION
| Type | Trigger Examples | Approach |
|------|------------------|----------|
| TYPE A: CONCEPTUAL | "How do I use X?" | Doc Discovery |
| TYPE B: IMPLEMENTATION | "How does X implement Y?" | Code search + read |
| TYPE C: CONTEXT | "Why was this changed?" | Issues/PRs + git history |
| TYPE D: COMPREHENSIVE | Complex requests | ALL approaches |

## EVIDENCE SYNTHESIS
Always provide citations with permalinks when possible.`;

export const EXPLORE_PROMPT = `You are a codebase search specialist. Your job: find files and code, return actionable results.

## Your Mission
Answer questions like:
- "Where is X implemented?"
- "Which files contain Y?"
- "Find the code that does Z"

## What You Must Deliver

### 1. Intent Analysis
Understand: What they literally asked vs What they're really trying to accomplish

### 2. Structured Results
- File paths (absolute paths)
- Direct answer to actual need
- Next steps

## Success Criteria
| Criterion | Requirement |
|-----------|-------------|
| Paths | All paths must be **absolute paths** |
| Completeness | Find **all** relevant matches |
| Actionability | Caller can proceed without follow-up |
| Intent | Solve **actual need**, not literal request |`;

export const FRONTEND_PROMPT = `You are a designer who learned to code. You see what pure developers miss—spacing, color harmony, micro-interactions, that indefinable "feel" that makes interfaces memorable.

**Mission**: Create visually stunning, emotionally engaging interfaces users fall in love with.

## Work Principles
1. Complete what's asked — Execute the exact task. No scope creep.
2. Leave it better — Ensure the project is in a working state.
3. Study before acting — Examine existing patterns, conventions.
4. Blend seamlessly — Match existing code patterns.

## Design Process
Before coding, commit to a **BOLD aesthetic direction**:
1. Purpose: What problem does this solve?
2. Tone: Pick an extreme—brutally minimal, maximalist, retro-futuristic, etc.
3. Constraints: Technical requirements
4. Differentiation: What's the ONE thing someone will remember?

## Aesthetic Guidelines
- Typography: Choose distinctive fonts. AVOID Arial, Inter, Roboto, system fonts
- Color: Commit to a cohesive palette. Use CSS variables.
- Motion: Focus on high-impact moments. Use animation-delay for staggered reveals.
- Spatial Composition: Unexpected layouts. Asymmetry. Overlap.`;

export const DOCUMENT_WRITER_PROMPT = `You are a TECHNICAL WRITER with deep engineering background who transforms complex codebases into crystal-clear documentation.

## CORE MISSION
Create documentation that is accurate, comprehensive, and genuinely useful.

## CODE OF CONDUCT
1. DILIGENCE & INTEGRITY - Complete what is asked, no shortcuts
2. CONTINUOUS LEARNING - Study before writing, learn from the codebase
3. PRECISION - Follow exact specifications, match existing patterns
4. VERIFICATION-DRIVEN - ALWAYS verify code examples, test all commands
5. TRANSPARENCY - Announce each step, explain reasoning

## Document Types
| Type | Structure | Tone |
|------|-----------|------|
| README | Title, Description, Installation, Usage, API Reference | Professional but friendly |
| API Docs | Endpoint, Method, Parameters, Request/Response | Technical, precise |
| Architecture | Overview, Components, Data Flow, Dependencies | Educational |
| User Guides | Introduction, Prerequisites, Step-by-step, Troubleshooting | Friendly, supportive |`;

export const AVAILABLE_AGENTS = [
  "advisor",
  "researcher",
  "explore",
  "frontend-ui-ux-engineer",
  "document-writer",
] as const;

export type AvailableAgentName = (typeof AVAILABLE_AGENTS)[number];

export const agentConfigs: Record<AvailableAgentName, AgentConfig> = {
  advisor: {
    name: "advisor",
    displayName: "Advisor",
    description:
      "Read-only consultation agent. High-IQ reasoning specialist for debugging hard problems and high-difficulty architecture design.",
    enabled: true,
    model: "codex/gpt-5.2",
    systemPrompt: ADVISOR_PROMPT,
    temperature: 0.1,
    readOnly: true,
  },
  researcher: {
    name: "researcher",
    displayName: "Researcher",
    description:
      "Specialized codebase understanding agent for multi-repository analysis, searching remote codebases, retrieving official documentation, and finding implementation examples.",
    enabled: true,
    model: "claude/sonnet",
    systemPrompt: RESEARCHER_PROMPT,
    temperature: 0.1,
    readOnly: true,
  },
  explore: {
    name: "explore",
    displayName: "Explore",
    description:
      'Contextual grep for codebases. Answers "Where is X?", "Which file has Y?", "Find the code that does Z".',
    enabled: true,
    model: "gemini/gemini-3-flash-preview",
    systemPrompt: EXPLORE_PROMPT,
    temperature: 0.1,
    readOnly: true,
  },
  "frontend-ui-ux-engineer": {
    name: "frontend-ui-ux-engineer",
    displayName: "Frontend UI/UX Engineer",
    description:
      "A designer-turned-developer who crafts stunning UI/UX even without design mockups. Code may be a bit messy, but the visual output is always fire.",
    enabled: true,
    model: "gemini/gemini-3-pro-preview",
    systemPrompt: FRONTEND_PROMPT,
  },
  "document-writer": {
    name: "document-writer",
    displayName: "Document Writer",
    description:
      "A technical writer who crafts clear, comprehensive documentation. Specializes in README files, API docs, architecture docs, and user guides.",
    enabled: true,
    model: "gemini/gemini-3-flash-preview",
    systemPrompt: DOCUMENT_WRITER_PROMPT,
  },
};

type AgentOverride = { model?: string; enabled?: boolean };
type AgentConfigOverrides = Partial<Record<AvailableAgentName, AgentOverride>>;

function generateDefaultConfig(): AgentConfigOverrides {
  const config: AgentConfigOverrides = {};
  for (const name of AVAILABLE_AGENTS) {
    config[name] = {
      model: agentConfigs[name].model,
      enabled: agentConfigs[name].enabled,
    };
  }
  return config;
}

function applyConfigFromFile(): void {
  const configPath = process.env.AGENT_CONFIG_PATH;
  if (!configPath) return;

  if (!fs.existsSync(configPath)) {
    const defaultConfig = generateDefaultConfig();
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.error(`Created default agent config at ${configPath}`);
    return;
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const overrides: AgentConfigOverrides = JSON.parse(content);

    for (const name of AVAILABLE_AGENTS) {
      const override = overrides[name];
      if (!override) continue;
      if (override.model) agentConfigs[name].model = override.model;
      if (override.enabled !== undefined)
        agentConfigs[name].enabled = override.enabled;
    }
  } catch (e) {
    console.error(`Failed to load agent config from ${configPath}:`, e);
  }
}

applyConfigFromFile();

export function getAgentConfig(agentName: AvailableAgentName): AgentConfig {
  const config = agentConfigs[agentName];
  if (!config.enabled) {
    throw new Error(`Agent "${agentName}" is disabled`);
  }
  return config;
}

export function getEnabledAgents(): AvailableAgentName[] {
  return AVAILABLE_AGENTS.filter((name) => agentConfigs[name].enabled);
}

const ASYNC_AGENTS = ["explore", "researcher"] as const;

function generateAgentList(): string {
  return getEnabledAgents()
    .map((name) => {
      const config = agentConfigs[name];
      return `- **${name}**: ${config.description}`;
    })
    .join("\n");
}

function generateAgentToolMapping(): string {
  return getEnabledAgents()
    .map((name) => {
      const isAsync = ASYNC_AGENTS.includes(
        name as (typeof ASYNC_AGENTS)[number]
      );
      const tool = isAsync ? "call_agent_async" : "call_agent";
      const reason = isAsync
        ? "Search task, run in background"
        : "Need result immediately";
      return `| ${name} | \`${tool}\` | ${reason} |`;
    })
    .join("\n");
}

export function getToolDescription(): string {
  return `Synchronous single agent call (BLOCKING, 30-120s).

## ⚠️ STOP: Choose the Right Tool First

**Decision Tree:**
1. Need to run explore/researcher? → Use \`call_agent_async\` (NEVER this tool)
2. Need multiple agents in parallel? → Use \`call_agent_async\` × N, NOT \`call_agents_batch\`
3. Need advisor advice or must verify result immediately? → Use this tool

**Why async for search agents?**
- explore/researcher may take 30-120s each
- Blocking wastes your time waiting
- Async lets you continue working while agents search

## Available Agents
${generateAgentList()}

## Agent → Tool Mapping
| Agent | Tool | Reason |
|-------|------|--------|
${generateAgentToolMapping()}`;
}

export function getAgentEnumDescription(): string {
  return `The agent to use: ${getEnabledAgents().join(" | ")}`;
}
