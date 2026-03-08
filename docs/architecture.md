# Architecture overview

This document provides an overview of the Gemini CLI architecture, including its
monorepo structure, package responsibilities, request lifecycle, and key
subsystems.

## Monorepo structure

Gemini CLI uses a monorepo structure managed with npm workspaces. The main
packages are located in the `packages/` directory:

```text
packages/
├── cli/                 # Terminal user interface (React/Ink)
├── core/                # Backend logic and API interactions
├── sdk/                 # Extension development SDK
├── a2a-server/          # Agent-to-Agent (A2A) protocol server
├── devtools/            # Developer tools and utilities
├── test-utils/          # Shared testing utilities
└── vscode-ide-companion/ # VS Code extension for IDE integration
```

## Package responsibilities

### `@google/gemini-cli` (packages/cli)

The CLI package is the main entry point and handles:

- **Terminal rendering**: Uses React and
  [Ink](https://github.com/vadimdemedes/ink) for building the terminal user
  interface
- **User input**: Manages interactive prompts, keyboard input, and command
  parsing
- **Slash commands**: Implements built-in commands like `/help`, `/about`,
  `/stats`
- **Session management**: Handles conversation sessions and history
- **Tool result display**: Renders tool outputs in a user-friendly format

### `@google/gemini-cli-core` (packages/core)

The core package contains the backend logic:

- **API integration**: Communicates with the Gemini API via `@google/genai`
- **Tool system**: Implements built-in tools (file operations, shell, web fetch)
- **Scheduler**: Manages tool execution with confirmation policies
- **Agents**: Implements subagents for specialized tasks (browser, codebase
  investigation)
- **Prompt management**: Builds and manages system prompts
- **Memory system**: Handles persistent context via GEMINI.md files
- **Configuration**: Loads and validates settings from multiple sources
- **Policy engine**: Enforces security policies for tool execution
- **Telemetry**: Collects usage metrics and traces

### `@google/gemini-cli-sdk` (packages/sdk)

The SDK provides APIs for building extensions:

- **Type definitions**: TypeScript types for extension development
- **Tool definitions**: Utilities for creating custom tools
- **Hooks**: APIs for lifecycle hooks (pre-tool, post-tool, etc.)

### `@google/gemini-cli-a2a-server` (packages/a2a-server)

Implements the Agent-to-Agent (A2A) protocol for remote agent communication:

- **HTTP server**: Exposes Gemini CLI as a remote agent
- **Task management**: Handles task lifecycle for A2A requests

## Request lifecycle

When a user enters a prompt, the following flow occurs:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Prompt                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. CLI Layer (packages/cli)                                                │
│     • Parse input and slash commands                                        │
│     • Build conversation context                                            │
│     • Send request to core                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. Core Layer (packages/core)                                              │
│     • Load system prompt + GEMINI.md context                                │
│     • Make API call to Gemini                                               │
│     • Receive response with potential tool calls                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. Tool Loop                                                               │
│     • If no tool calls → return text response                               │
│     • If tool calls present → continue to scheduler                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. Scheduler (packages/core/src/scheduler)                                 │
│     • Apply policy rules (allow/deny/ask)                                   │
│     • Request user confirmation if needed                                   │
│     • Execute approved tools                                                │
│     • Collect tool outputs                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. Return to Model                                                         │
│     • Send tool results back to Gemini                                      │
│     • Repeat until no more tool calls                                       │
│     • Return final response to user                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tool system

Tools extend the agent's capabilities beyond text generation. Located in
`packages/core/src/tools/`, the built-in tools include:

| Tool              | Description                                     |
| ----------------- | ----------------------------------------------- |
| `read_file`       | Read contents of a file                         |
| `read_many_files` | Read multiple files in parallel                 |
| `write_file`      | Create or overwrite a file                      |
| `edit`            | Make targeted edits to existing files           |
| `shell`           | Execute shell commands                          |
| `glob`            | Find files matching glob patterns               |
| `grep`            | Search file contents with regex                 |
| `ls`              | List directory contents                         |
| `web_fetch`       | Fetch content from URLs                         |
| `web_search`      | Search the web                                  |
| `memory`          | Read/write persistent memory files              |
| `write_todos`     | Track tasks with a todo list                    |
| `mcp_*`           | Tools from MCP (Model Context Protocol) servers |

### Tool registry

The tool registry (`packages/core/src/tools/tool-registry.ts`) manages tool
registration and lookup. Tools can be:

- **Built-in**: Core tools shipped with Gemini CLI
- **Extension tools**: Added via installed extensions
- **MCP tools**: Dynamically loaded from MCP servers

## Scheduler

The scheduler (`packages/core/src/scheduler/`) manages tool execution with a
confirmation-based security model:

1. **Policy evaluation**: Each tool call is evaluated against policy rules
2. **Confirmation flow**: Tools requiring confirmation prompt the user
3. **Parallel execution**: Independent tools can run concurrently
4. **State management**: Tracks tool execution state across turns

### Policy engine

The policy engine (`packages/core/src/policy/`) determines tool permissions:

- **Allow**: Execute without confirmation
- **Deny**: Block execution entirely
- **Ask**: Prompt user for confirmation

Policies are loaded from:

- User-level: `~/.gemini/policies/*.toml`
- Workspace-level: `.gemini/policies/*.toml`

## Agents and subagents

Gemini CLI supports specialized subagents for complex tasks:

| Agent                   | Purpose                      |
| ----------------------- | ---------------------------- |
| `codebase-investigator` | Deep codebase analysis       |
| `browser`               | Web browsing with Playwright |
| `cli-help-agent`        | Help with Gemini CLI usage   |
| `generalist`            | General-purpose delegation   |

Agents are managed in `packages/core/src/agents/` and can be:

- **Local**: Run in the same process
- **Remote**: Connect via A2A protocol

## Context and memory system

### GEMINI.md hierarchy

Gemini CLI loads context from GEMINI.md files in a hierarchical manner:

1. **Global**: `~/.gemini/GEMINI.md` — personal preferences
2. **Workspace**: `./GEMINI.md` — project-specific instructions
3. **Directory**: Nested GEMINI.md files in subdirectories

### Memory files

Persistent memory is stored in `~/.gemini/memory/` and can be accessed via the
`memory` tool, allowing the agent to remember information across sessions.

## Configuration

Settings are loaded from multiple sources in priority order:

1. **Command-line arguments**: `--model`, `--sandbox`, etc.
2. **Environment variables**: `GEMINI_MODEL`, `GEMINI_SANDBOX`, etc.
3. **Project settings**: `.gemini/settings.json`
4. **User settings**: `~/.gemini/settings.json`

The `Config` class (`packages/core/src/config/`) merges these sources and
provides validated configuration to the application.

## CLI rendering

The terminal UI is built with React and Ink (`packages/cli/src/ui/`):

- **AppContainer**: Root component managing application state
- **MainContent**: Renders conversation messages
- **ToolMessage**: Displays tool calls and results
- **Footer**: Shows status bar with stats and tips

### Context providers

React context providers share state across components:

- **ConversationContext**: Chat messages and history
- **ConfigContext**: Application configuration
- **ToolContext**: Tool execution state

## Extensions

Extensions add functionality through:

- **Custom tools**: New capabilities for the agent
- **Hooks**: Lifecycle callbacks (pre/post tool execution)
- **MCP servers**: External services via Model Context Protocol

See the [extensions documentation](./extensions/index.md) for more details.

## Related documentation

- [Local development guide](./local-development.md) — Set up your development
  environment
- [Contribution guide](../CONTRIBUTING.md) — How to contribute to Gemini CLI
- [Extensions overview](./extensions/index.md) — Build and install extensions
