# Impart MCP (Agent Orchestration Layer)

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue?style=flat-square)](https://modelcontextprotocol.io/)
[![npm](https://img.shields.io/npm/v/impart-mcp?style=flat-square)](https://www.npmjs.com/package/impart-mcp)

`impart-mcp` 是一个基于 **Model Context Protocol (MCP)** 的智能体编排服务器。它充当「Agent 编排层」，将具备高度工程化能力的专家智能体（如 Claude Code, Codex CLI 等）封装为标准 MCP 工具，使宿主环境（Claude Desktop, Cursor 等）能够通过统一接口调用这些具备复杂任务处理能力的「超级 Agent」。

## 🚀 核心特性

- **多智能体编排**：内置 5 种预设专家提示词和工具权限的专业 Agent。
- **跨平台集成**：完美适配 Claude Desktop, Cursor, Gemini CLI 等支持 MCP 的环境。
- **异步任务处理**：支持耗时任务的后台运行与结果轮询。
- **混合模型供应商**：集成 Vercel AI SDK，支持 Claude Code、Codex CLI 和 Gemini CLI 驱动的 Agent。
- **灵活配置**：通过 JSON 配置文件自定义每个 Agent 的模型、开关及参数。

## 🛠️ 专家智能体 (Agents)

| Agent 名称 | 核心定位 | 默认模型 | 权限 |
|:---|:---|:---|:---|
| **Advisor** | 架构与调试专家，处理高难度工程问题 | `codex/gpt-5.2` | Read-only |
| **Researcher** | 代码研究专家，擅长跨仓搜索与文档分析 | `claude/sonnet` | Read-only |
| **Explore** | 代码定位专家，快速回答「某逻辑在哪里」 | `gemini/gemini-3-flash-preview` | Read-only |
| **Frontend Engineer** | UI/UX 实现专家，独立完成高保真组件 | `gemini/gemini-3-pro-preview` | Read-write |
| **Document Writer** | 技术文档专家，撰写清晰的规范文档 | `gemini/gemini-3-flash-preview` | Read-write |

## 📦 安装说明

### 方式一：npx 直接运行（推荐）

无需安装，直接在 MCP 配置中使用：

```bash
npx impart-mcp@latest
```

### 方式二：全局安装

```bash
npm install -g impart-mcp
# 或
bun add -g impart-mcp
```

### 方式三：从源码安装

前置要求：[Bun](https://bun.sh/) 或 [Node.js](https://nodejs.org/) >= 18

```bash
git clone <repository-url>
cd impart-mcp
bun install  # 或 npm install
bun run build  # 构建产物
```

## 🔌 使用集成

### 配置到 Cursor

1. 打开 Cursor 设置 -> Features -> MCP。
2. 添加新的 MCP Server。
3. Name: `impart-mcp`
4. Type: `command`
5. Command: `npx impart-mcp@latest`（或全局安装后直接使用 `impart-mcp`）

### 配置到 Claude Code

使用 `claude mcp add` 命令一键添加：

```bash
claude mcp add impart-mcp -- npx impart-mcp@latest
```

或全局安装后：

```bash
claude mcp add impart-mcp -- impart-mcp
```

## ⚙️ 配置说明

默认情况下，所有 Agent 使用内置的默认配置即可运行，无需额外配置。

### 自定义配置（可选）

如需自定义 Agent 的模型或开关，可通过环境变量 `AGENT_CONFIG_PATH` 指定配置文件路径：

```json
{
  "mcpServers": {
    "impart-mcp": {
      "command": "npx",
      "args": ["impart-mcp@latest"],
      "env": {
        "AGENT_CONFIG_PATH": "/path/to/your/agent-config.json"
      }
    }
  }
}
```

**自动初始化**：若指定的配置文件不存在，系统会在首次运行时自动生成包含所有默认值的配置模板，方便你按需修改。

**配置文件示例 (`agent-config.json`)：**
```json
{
  "advisor": {
    "model": "codex/gpt-5.2",
    "enabled": true
  },
  "researcher": {
    "model": "claude/sonnet",
    "enabled": true
  },
  "frontend-ui-ux-engineer": {
    "model": "gemini/gemini-3-pro-preview",
    "enabled": true
  }
}
```

## 📋 API 文档 (MCP Tools)

服务器提供了以下核心工具：

| 工具名称 | 类型 | 描述 |
|:---|:---|:---|
| `call_agent` | 同步 | 阻塞式调用，适用于需要立即验证结果的场景 |
| `call_agent_async` | 异步 | 后台启动任务，返回 `task_id`，推荐用于耗时较长的搜索任务 |
| `get_agent_result` | 查询 | 获取异步任务状态，支持 `block` 模式阻塞等待 |
| `call_agents_batch` | 批量 | 并行调用多个 Agent，阻塞直到所有任务完成 |

### 参数说明

**`call_agent` / `call_agent_async`：**
- `agent`：Agent 名称枚举 (`advisor` | `researcher` | `explore` | `frontend-ui-ux-engineer` | `document-writer`)
- `prompt`：任务描述
- `cwd`：工作目录（必填）
- `context`：可选上下文信息

## 👨‍💻 开发说明

| 命令 | 描述 |
|:---|:---|
| `bun start` | 启动服务（Bun 运行时）|
| `bun dev` | 开发模式（支持热重载）|
| `bun run build` | 构建产物到 `dist/` |
| `node dist/server.js` | 启动服务（Node.js 运行时）|

### 核心逻辑路径

| 文件 | 职责 |
|:---|:---|
| `src/server.ts` | MCP 协议处理与工具注册 |
| `src/agents/` | Agent 的 System Prompt 及行为定义 |
| `src/providers/` | 模型供应商适配逻辑 |
| `src/types.ts` | 全局类型定义 |

## 📄 许可证

[MIT License](LICENSE)
