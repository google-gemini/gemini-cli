# Architecture overview

This document explains how Gemini CLI works under the hood. It is intended for
contributors and advanced users who want to understand the system's internals.

## High-level overview

Gemini CLI is an open-source, terminal-first AI agent that connects your command
line to Google's Gemini models. It is structured as a
[monorepo](https://en.wikipedia.org/wiki/Monorepo) using npm workspaces, with
each package responsible for a distinct layer of the system.

```text
gemini-cli/
├── packages/
│   ├── cli/          # Terminal UI (React/Ink), user input, rendering
│   ├── core/         # Backend logic, API calls, tool execution, prompts
│   ├── devtools/     # Developer tools server and UI (network/console inspector)
│   ├── a2a-server/   # Experimental Agent-to-Agent server
│   ├── test-utils/   # Shared testing utilities
│   └── vscode-ide-companion/  # VS Code extension
├── docs/             # Project documentation
└── scripts/          # Build and development scripts
```

The two primary packages are `cli` and `core`. Everything else is either
experimental or supports development workflows.

## Package responsibilities

### The `cli` package

The `cli` package owns the terminal user interface. It is built with
[React](https://react.dev/) and [Ink](https://github.com/vadimdemedes/ink),
which renders React components directly to the terminal.

Key responsibilities:

- **User input** — Captures prompts, keyboard shortcuts, and slash commands.
- **Rendering** — Displays streamed model responses, tool call confirmations,
  status indicators, and error messages.
- **React context providers** — Manages UI state through contexts like
  `SessionContext`, `UIStateContext`, `ConfigContext`, and `SettingsContext`.
- **Entry point** — `gemini.tsx` initializes authentication, loads settings, and
  renders the interactive application. `nonInteractiveCli.ts` handles headless
  (non-TTY) mode.

### The `core` package

The `core` package contains all backend logic. It has no dependency on the
terminal UI and can be used independently (for example, by the A2A server).

Key responsibilities:

- **Gemini API communication** — Sends requests, handles streaming responses,
  retries, and authentication.
- **Tool execution** — Registers, validates, confirms, and executes tools.
- **Prompt construction** — Builds system prompts from templates, memory files,
  and runtime context.
- **Configuration** — Loads settings from files, environment variables, and
  command-line arguments.
- **Agent orchestration** — Runs the agentic loop that iterates between the
  model and tools until the task is complete.

## Request lifecycle

When you type a prompt and press Enter, the following sequence occurs:

```text
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌────────────┐
│ User     │───▶│ System       │───▶│ GeminiChat   │───▶│ Gemini API │
│ prompt   │    │ prompt build │    │ .sendMessage │    │ (streaming)│
└──────────┘    └──────────────┘    │  Stream()    │    └────────────┘
                                    └──────────────┘
                                           │
                              ◀────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Parse response    │
                    │ (text or          │
                    │  function calls?) │
                    └─────────┬─────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼                             ▼
     ┌─────────────────┐          ┌──────────────────┐
     │ Text response   │          │ Function calls   │
     │ → Display to    │          │ → Scheduler      │
     │   user          │          │ → Execute tools  │
     └─────────────────┘          │ → Feed results   │
                                  │   back to model  │
                                  └──────────────────┘
                                         │
                                         ▼
                                  (loop continues until
                                   model returns text)
```

### Step by step

1. **Prompt construction** — The `PromptProvider` assembles the system prompt.
   It combines built-in instructions, your `GEMINI.md` memory files (global,
   extension, and project-level), directory context, and tool declarations.

2. **API call** — `GeminiChat.sendMessageStream()` sends the user message along
   with the full conversation history to the Gemini API. The `ContentGenerator`
   handles the actual HTTP request, which is wrapped in `retryWithBackoff()` for
   resilience against transient errors and rate limits.

3. **Streaming response** — The response streams back in chunks. Each chunk may
   contain text (displayed to you immediately), thinking content (shown as
   thought summaries), or function calls (tool requests).

4. **Tool execution** — If the model returns function calls, they are handed to
   the **Scheduler** for execution. The results are sent back to the model as
   function responses, and the loop continues.

5. **Completion** — The loop ends when the model returns a text-only response
   with no further tool calls. The final text is displayed to you.

## The agentic loop

The agentic loop is the core execution pattern that makes Gemini CLI an _agent_
rather than a simple chatbot. The model can autonomously call tools, observe
results, and decide what to do next.

### Main agent loop

The main conversation loop in the CLI works as follows:

1. You send a message.
2. The model responds with text, tool calls, or both.
3. If there are tool calls, the CLI executes them and sends the results back.
4. Steps 2–3 repeat until the model responds with text only.

### Subagent loop

Subagents are isolated agent instances that run a focused task. The
`LocalAgentExecutor` class manages them:

- **Isolated tool registry** — Each subagent gets its own `ToolRegistry` with
  only the tools specified in its definition.
- **Turn-based execution** — The subagent runs in a loop, calling the model and
  executing tools, until it calls the `complete_task` tool to signal completion.
- **Timeout and recovery** — Subagents have configurable time limits
  (`maxTimeMinutes`) and turn limits (`maxTurns`). When a limit is reached, the
  agent gets one final "grace period" turn to submit its best answer.
- **Chat compression** — Long-running subagents use `ChatCompressionService` to
  summarize conversation history and stay within the context window.

## Tool system

Tools extend the model's capabilities beyond text generation. Each tool follows
a consistent lifecycle.

### Tool interface

Every tool implements the `ToolInvocation` interface, with three key methods:

- `getDescription()` — Returns a human-readable description of what the tool
  will do with the given parameters.
- `shouldConfirmExecute()` — Determines whether the user must approve the action
  before execution.
- `execute()` — Runs the tool and returns the result.

Tools are registered in a `ToolRegistry`, which the model queries to discover
available tools and their parameter schemas.

### Built-in tools

Gemini CLI ships with several built-in tools:

| Tool              | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `shell`           | Executes shell commands in your terminal      |
| `edit`            | Modifies file contents with find-and-replace  |
| `read_file`       | Reads file contents from disk                 |
| `read_many_files` | Reads multiple files in a single call         |
| `write_file`      | Creates or overwrites files                   |
| `web_fetch`       | Retrieves content from URLs                   |
| `web_search`      | Performs Google Search queries                |
| `memory`          | Manages persistent context in GEMINI.md files |

### MCP tools

Gemini CLI supports the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/), which allows
you to connect external tool servers. When you configure an MCP server in your
`settings.json`, the CLI discovers its tools at startup and makes them available
to the model alongside built-in tools.

## Scheduler

The `Scheduler` is an event-driven orchestrator that manages tool execution. It
processes tool calls through a multi-phase pipeline:

### Phase 1: Ingestion and validation

When the model returns function calls, the scheduler resolves each one against
the `ToolRegistry` and validates the parameters:

- If the tool is not found, an error response is generated immediately.
- If the parameters are invalid, the tool call is rejected with details.
- Read-only tools are batched for parallel execution.

### Phase 2: Policy and confirmation

Each validated tool call passes through the **Policy Engine**:

- **ALLOW** — The tool runs immediately without user interaction.
- **DENY** — The tool is blocked (for example, by admin controls or security
  policy).
- **ASK_USER** — The user sees a confirmation prompt and can approve, deny, or
  approve permanently.

When you choose "Always allow" for a command, the policy engine saves that
decision so you are not asked again.

### Phase 3: Execution

Approved tool calls are executed. The scheduler:

- Runs read-only tools in parallel for performance.
- Runs write tools sequentially to avoid conflicts.
- Streams live output updates (for example, shell command output).
- Handles cancellation via `AbortSignal`.

## Authentication and content generation

The `ContentGenerator` interface abstracts API communication. Gemini CLI
supports multiple authentication methods:

| Auth type                 | Environment variable                                | Description               |
| ------------------------- | --------------------------------------------------- | ------------------------- |
| Login with Google (OAuth) | _(browser flow)_                                    | Free tier with 60 req/min |
| Gemini API key            | `GEMINI_API_KEY`                                    | Direct API access         |
| Vertex AI                 | `GOOGLE_GENAI_USE_VERTEXAI=true` + `GOOGLE_API_KEY` (or `GOOGLE_CLOUD_PROJECT` & `_LOCATION`) | Enterprise                |
| Cloud Shell / ADC         | `CLOUD_SHELL=true`                                  | Google Cloud environments |

The `createContentGenerator()` function selects the appropriate API client based
on the active authentication type. All API calls are wrapped in a
`LoggingContentGenerator` for debugging and telemetry.

### Retry and fallback

API calls use `retryWithBackoff()` for resilience:

- **Transient errors** (network failures, 5xx responses) are retried with
  exponential backoff and jitter.
- **Rate limits** (429 responses) trigger a fallback flow that can switch to a
  different model (for example, from Pro to Flash).
- **Quota errors** are surfaced to the user with remaining quota information.

## Context and memory system

Gemini CLI uses `GEMINI.md` files to provide persistent context to the model.
These files are discovered automatically from multiple locations and organized
in a hierarchy.

### Memory hierarchy

1. **Global memory** — `~/.gemini/GEMINI.md` applies to all your projects.
2. **Extension memory** — Context files provided by installed extensions.
3. **Project memory** — `GEMINI.md` files found in your project directory and
   its parent directories up to the project root.
4. **JIT (just-in-time) memory** — When a tool accesses a file, the CLI scans
   that directory and its ancestors for `GEMINI.md` files. This allows
   component-specific instructions to load only when needed.

All discovered memory files are concatenated and included in the system prompt
with clear markers indicating their source paths.

### Memory modularization

You can break large `GEMINI.md` files into smaller components using the
`@file.md` import syntax:

```markdown
# Main GEMINI.md

@./components/coding-style.md @./components/testing-guide.md
```

## Configuration

The `Config` class is the central runtime state object. It aggregates settings
from multiple sources:

1. **Command-line arguments** — Flags like `--model`, `--sandbox`, and
   `--include-directories`.
2. **Settings files** — `~/.gemini/settings.json` (global) and
   `.gemini/settings.json` (project-level).
3. **Environment variables** — `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT`, and
   others.
4. **Admin controls** — Enterprise settings fetched from the server.

The `Config` object is passed throughout the system and provides access to
services like the `ToolRegistry`, `ModelConfigService`,
`ModelAvailabilityService`, and `GeminiClient`.

### Model configuration

The `ModelConfigService` manages model aliases and per-model overrides. You can
configure different generation parameters (temperature, top-k, safety settings)
for specific models or model aliases in your `settings.json`.

## CLI rendering

The terminal UI is built with React and Ink. The component tree uses several
React context providers to share state without prop drilling.

### Key context providers

| Context            | Provider           | Purpose                          |
| ------------------ | ------------------ | -------------------------------- |
| `SessionContext`   | `gemini.tsx`       | Session ID, authentication state |
| `SettingsContext`  | `gemini.tsx`       | User preferences and settings    |
| `VimModeContext`   | `gemini.tsx`       | Vim key bindings toggle          |
| `AppContext`       | `AppContainer.tsx` | Application-level state          |
| `ConfigContext`    | `AppContainer.tsx` | Runtime configuration access     |
| `UIStateContext`   | `AppContainer.tsx` | Current UI state (dialogs, mode) |
| `UIActionsContext` | `AppContainer.tsx` | Actions to update UI state       |

### Rendering modes

The CLI supports two rendering modes:

- **Interactive mode** — The full React/Ink UI with input composer, streamed
  responses, tool confirmations, and keyboard shortcuts.
- **Headless mode** — A non-interactive mode for scripted usage. Output is plain
  text, JSON, or streaming JSON (JSONL), depending on the `--output-format`
  flag.

## Next steps

- Read the [Contribution guide](../CONTRIBUTING.md) to set up your development
  environment.
- Explore the [Tools reference](./reference/tools.md) for details on built-in
  tools.
- Learn about [MCP server integration](./tools/mcp-server.md) to extend the CLI
  with custom tools.
- Review the [Settings reference](./cli/settings.md) for all configuration
  options.
