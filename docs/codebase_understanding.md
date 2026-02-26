# Codebase understanding

This document provides an in-depth technical overview of the Gemini CLI
architecture. It is intended for developers who want to understand the system's
inner workings, from startup to advanced agentic orchestration.

## Repository structure

Gemini CLI is a monorepo managed with npm workspaces. It strictly separates
concerns across packages:

- **`packages/cli`**: The terminal user interface (TUI) layer. Built with React
  and Ink, it handles user interaction, rendering, and terminal state.
- **`packages/core`**: The engine containing all business logic. It is entirely
  UI-agnostic and manages the agent's lifecycle, Gemini API interactions, and
  tool systems.
- **`packages/devtools`**: A suite for inspection. It provides a Chrome-like
  Network and Console inspector for real-time debugging.
- **`packages/sdk`**: A library for building third-party extensions.
- **`packages/vscode-ide-companion`**: Bridges the editor and CLI, providing
  real-time IDE context to the agent.

---

## 1. Application lifecycle

### Startup and initialization
The entry point is `packages/cli/src/gemini.tsx`. The startup sequence involves:
1.  **Standard I/O patching**: The CLI patches `process.stdout` and
    `process.stderr` to capture all output, ensuring it can be redirected to the
    TUI or debug logs without garbling the terminal display.
2.  **Sandboxing and relaunch**: If `advanced.sandbox` is enabled, the CLI
    re-launches itself in a restricted environment. It also uses a relaunch
    mechanism to automatically configure Node.js memory limits (e.g.,
    `--max-old-space-size`).
3.  **Authentication**: Credentials are validated early. The CLI supports
    multiple auth types, including API Keys, OAuth2, and Vertex AI.

### Execution modes
The CLI operates in two distinct modes:
- **Interactive (TUI)**: Uses the `render` function from Ink to start a
  persistent React application in the terminal.
- **Non-interactive (CLI)**: A streamlined execution loop in
  `nonInteractiveCli.ts` that runs until the agent completes its task,
  supporting piped input and output redirection.

---

## 2. Model routing engine

The `ModelRouterService` (`packages/core/src/routing`) is responsible for
selecting the most appropriate model for every request.

### Composite strategy
The router uses a "Composite Strategy" that evaluates multiple sub-strategies in
priority order:
1.  **Fallback**: Switches models if a quota error or API failure occurs.
2.  **Override**: Respects user-specified model overrides (e.g., `--model`).
3.  **Approval Mode**: Selects specialized models for `Plan Mode`.
4.  **Classifier**: A lightweight LLM call that analyzes the user's request
    against a rubric (Strategic Planning, Complexity, Ambiguity) to choose
    between a "Pro" (complex) or "Flash" (simple) model.
5.  **Numerical Classifier**: A deterministic classifier based on token counts
    and history depth.

---

## 3. Intelligent context management

Managing the model's context window is critical for long-running sessions. This
is handled by two primary services in `packages/core/src/services`:

### ChatCompressionService
When history exceeds a threshold (default 50% of the context window), the
compression service triggers:
1.  **Split point detection**: It identifies a safe point in history to begin
    summarization, ensuring recent turns remain in high-fidelity.
2.  **State snapshot generation**: The LLM generates a `<state_snapshot>`—a
    structured summary of established constraints, technical details, and
    progress.
3.  **The "Probe" (Self-Correction)**: A second model call "probes" the generated
    summary against the original history to ensure no critical constraints or
    paths were omitted, correcting the summary if necessary.

### ToolOutputMaskingService
To prevent bulky tool outputs (like long log files) from clogging the context,
this service detects large `functionResponse` blocks and replaces them with
concise summaries or pointers to temporary files, preserving the model's ability
to reason about the data without consuming thousands of tokens.

---

## 4. Advanced tool execution

Tool execution is orchestrated by the `Scheduler`
(`packages/core/src/scheduler`), which operates as an event-driven state
machine.

### State management
Every tool call moves through a structured lifecycle managed by the
`SchedulerStateManager`:
`Validating` → `AwaitingApproval` → `Scheduled` → `Executing` → `Success`/`Error`

### Key features
- **Policy Engine**: A granular system that determines if a tool is safe to run.
  Policies can be "Always", "Ask", or "Never" based on the tool name, arguments,
  or folder location.
- **Tail Calls**: If a tool's output requires immediate follow-up (like a shell
  command that produced a specific error code), the scheduler can "tail call"
  another tool (e.g., a "fixer" or "retry") without ending the current turn.
- **Parallel execution**: The scheduler can execute multiple non-conflicting
  read-only tools in parallel while enforcing sequential execution for
  modifying tools.

---

## 5. UI architecture

The `packages/cli/src/ui` directory implements a sophisticated React-based
terminal interface.

### Rendering and layout
- **Ink**: Provides React components for terminal output (`Box`, `Text`).
- **AppContainer**: The root component that coordinates the display of multiple
  screens (Chat, Debug Console, Settings, Auth).
- **ConsolePatcher**: Intercepts `console.log` and redirects them to the
  internal "Debug Console" accessible via `ctrl+d`.

### State providers
Global state is managed through specialized providers:
- **`KeypressProvider`**: Captures and routes terminal keyboard events,
  supporting complex shortcuts and Vim-style navigation.
- **`TerminalProvider`**: Tracks the terminal size and window state using a
  custom `ResizeObserver`.
- **`VimModeProvider`**: Enables Vim-like keybindings for navigating through
  conversation history and multi-line input fields.

## Testing and quality assurance

The repo employs a three-tier testing strategy:
1.  **Unit tests**: Fast, isolated tests for core logic (Vitest).
2.  **Integration tests**: Verify full system flows, including mock Gemini API
    responses and real file system operations.
3.  **Evals**: Performance benchmarks in `evals/` that measure the agent's
    reasoning accuracy and tool-use efficiency over time.
