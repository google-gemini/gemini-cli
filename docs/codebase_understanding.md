# Codebase understanding

This document provides a detailed overview of the Gemini CLI architecture, its
core components, and how they interact to provide an agentic terminal
experience.

## Repository overview

Gemini CLI is structured as a monorepo using npm workspaces. The codebase is
divided into several specialized packages that separate the user interface from
the agentic orchestration logic.

### Core packages

- **`packages/cli`**: Contains the terminal user interface (TUI) implemented
  with React and Ink. It handles terminal-specific logic like keybindings,
  mouse events, and layout rendering.
- **`packages/core`**: The central engine of the application. It is UI-agnostic
  and manages the Gemini API communication, tool orchestration, conversation
  history, and policy enforcement.
- **`packages/devtools`**: Provides a developer-focused inspector (similar to
  Chrome DevTools) for monitoring network traffic and console logs in real-time.
- **`packages/sdk`**: A library for building extensions and custom tools that
  integrate with Gemini CLI.
- **`packages/vscode-ide-companion`**: A VS Code extension that connects the
  editor state to the CLI, enabling the agent to read open files and cursor
  positions.

## Application lifecycle

The application follows a structured startup and execution flow to ensure
security and environment consistency.

### Startup and sandboxing

When you launch Gemini CLI, the entry point in `packages/cli/src/gemini.tsx`
manages several initialization steps:

1.  **Configuration loading**: Loads user and workspace settings, parsing
    command-line arguments.
2.  **Authentication**: Validates credentials and refreshes OAuth tokens.
3.  **Sandboxing**: If configured, the application relaunches itself in a
    restricted child process using a "sandbox" environment to isolate tool
    execution.
4.  **Mode selection**: Determines whether to start the interactive TUI or run
    in non-interactive mode based on input and terminal state.

### Interactive vs. non-interactive modes

- **Interactive mode**: Renders the TUI using Ink. The state is managed via
  React contexts (Settings, Mouse, Keypress, Terminal) and a central
  `AppContainer`.
- **Non-interactive mode**: Executes a single prompt or command. It uses a
  focused loop in `packages/cli/src/nonInteractiveCli.ts` that continues until
  the agent completes its task or requires user intervention that cannot be
  provided.

## Agent orchestration

The orchestration of the agent's behavior happens primarily within
`packages/core/src/core`.

### GeminiClient

The `GeminiClient` is the primary interface for the rest of the application. It
coordinates:

- **Session management**: Initializing, resuming, and persisting chat sessions.
- **Model routing**: Deciding which Gemini model to use based on the task and
  configuration.
- **Context compression**: Summarizing long histories using the
  `ChatCompressionService` to stay within context window limits.
- **IDE integration**: Injecting editor context (open files, selections) into
  the prompt.

### GeminiChat and Turn

- **`GeminiChat`**: Manages the low-level API communication. It handles
  streaming responses, retries for transient network errors, and records the
  conversation history.
- **`Turn`**: Represents a single agentic exchange. A turn may involve multiple
  API calls if the model decides to use tools. It yields events for content,
  thoughts, and tool requests.

## Tool system and scheduler

The tool system allows the agent to interact with the external world. It is
built on a secure, policy-driven framework.

### Tool registry

The `ToolRegistry` in `packages/core/src/tools` maintains a list of all
available tools. It supports several types:

- **Built-in tools**: Native TypeScript implementations for file system
  operations, shell commands, and web fetching.
- **Discovered tools**: Local scripts or commands identified in the project
  root.
- **MCP tools**: Tools provided by external servers via the Model Context
  Protocol.

### Scheduler

The `Scheduler` in `packages/core/src/scheduler` manages the lifecycle of a
tool call:

1.  **Validation**: Ensures the tool exists and the arguments match the schema.
2.  **Policy check**: Consults the Policy Engine to determine if the tool is
    allowed to run automatically, requires user confirmation, or is denied.
3.  **Confirmation**: If required, it pauses execution and uses the
    `MessageBus` to request user approval through the UI.
4.  **Execution**: Runs the tool and captures the output, including live
    updates for long-running processes.
5.  **Feedback**: Sends the tool result back to the model to continue the
    agentic loop.

## UI architecture

The UI is built with React components rendered to the terminal via Ink. Key
design patterns include:

- **Providers**: Global state like settings, theme, and terminal size is
  provided through React Contexts to avoid prop drilling.
- **Console patching**: Standard `console.log` calls are intercepted and
  redirected to the TUI's debug console or the `devtools` server.
- **Event-driven updates**: The UI listens to `coreEvents` from the orchestrator
  to update its state (e.g., streaming text, tool progress, or errors).

## Testing and quality

The project maintains high standards through several testing tiers:

- **Unit tests**: Located alongside the source code (e.g., `*.test.ts`), using
  Vitest.
- **Integration tests**: E2E tests in the `integration-tests/` directory that
  run the compiled CLI against mocked and real API endpoints.
- **Evals**: Specialized evaluation scripts in `evals/` that measure the
  agent's performance on specific tasks like tool use and codebase navigation.
