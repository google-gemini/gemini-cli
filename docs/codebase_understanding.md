# Codebase understanding

This document provides a deep-dive technical overview of the Gemini CLI
architecture. It is designed for developers who need to understand the
system's inner workings, from startup to advanced autonomous behaviors.

## Repository architecture

Gemini CLI is a monorepo structured to maintain a strict separation between
the user interface and the agent's core reasoning logic.

- **`packages/cli`**: The Terminal User Interface (TUI). Built with React and
  Ink, it manages the interactive terminal experience, including keyboard
  protocols, rendering, and terminal state management.
- **`packages/core`**: The UI-agnostic engine. It contains the primary
  orchestration logic, model routing, tool systems, policy enforcement, and
  Gemini API communication.
- **`packages/devtools`**: A suite for real-time inspection of network traffic,
  console logs, and session activity.
- **`packages/sdk`**: A library for developers to build third-party tools and
  extensions.
- **`packages/vscode-ide-companion`**: A specialized bridge that feeds real-time
  editor state (open files, active selections, cursor positions) to the agent.

---

## 1. Application lifecycle

### Startup and initialization
The entry point is `packages/cli/src/gemini.tsx`. The startup sequence is
designed for security and resilience:

1.  **I/O redirection**: Standard output streams (`stdout`, `stderr`) are
    patched to capture all logs and errors. This allows the CLI to redirect
    diagnostic information to the TUI's debug console or a remote DevTools server
    without corrupting the user's terminal interface.
2.  **Memory-aware relaunch**: The CLI checks the host system's total memory.
    If it detects that Node.js's default heap limit is insufficient for complex
    codebase analysis, it re-launches itself using the
    `--max-old-space-size` flag, targeting approximately 50% of system memory.
3.  **Sandboxing**: If configured, the CLI launches a restricted "sandbox"
    environment (using Docker, Podman, or a localized process) to isolate the
    agent's autonomous actions from the host system.
4.  **Interactive (TUI) vs. Non-interactive (CLI)**:
    - **Interactive mode**: Initializes the Ink renderer, starting a persistent
      React application that manages terminal state via providers.
    - **Non-interactive mode**: Executes a streamlined loop in
      `nonInteractiveCli.ts`, designed for single prompts or piped input/output
      redirection.

---

## 2. Model routing and selection

The `ModelRouterService` (`packages/core/src/routing`) implements a
"Composite Strategy" to select the optimal model for every request.

### Routing strategies
- **classifier**: Uses a lightweight LLM call to categorize the complexity of a
  task based on a rubric (Strategic Planning, Multi-step Coordination,
  Ambiguity). It chooses between a "Pro" model (for complex reasoning) and a
  "Flash" model (for simple operations).
- **approvalMode**: Selects specialized models (like `gemini-2.0-flash-lite`)
  when the agent is in specific modes like `Plan Mode`.
- **numericalClassifier**: A deterministic strategy that selects models based
  on the number of tokens in the conversation or the length of the history.
- **fallback**: Automatically switches models if the primary model encounters
  quota limits (429) or transient API failures.

---

## 3. Intelligent context management

The agent maintains deep project awareness while staying within token limits
through several services in `packages/core/src/services`:

### ChatCompressionService
Triggered when the history exceeds 50% of the model's context window:
1.  **State snapshots**: The agent generates a structured `<state_snapshot>`
    representing the cumulative knowledge of the session (constraints, progress,
    paths).
2.  **The "Probe" (Self-Correction)**: A second LLM pass compares the summary
    against the original history to ensure no critical technical details or
    user-defined constraints were lost, correcting the summary before purging
    the history.

### ToolOutputMaskingService
Prevents bulky data (like large shell outputs or file reads) from clogging the
context window. It replaces large `functionResponse` blocks with concise
summaries and persists the full data to temporary files, allowing the agent to
refer to the full data only when necessary.

---

## 4. Advanced tool execution and scheduling

The `Scheduler` (`packages/core/src/scheduler`) is an event-driven state
machine that manages the lifecycle of autonomous actions.

### Lifecycle states
`Validating` → `AwaitingApproval` → `Scheduled` → `Executing` → `Success`/`Error`

### Key features
- **Policy Engine**: A granular system that evaluates tools based on security
  policies (e.g., "Allow read-only tools", "Ask for shell commands"). It can be
  configured at the project or user level.
- **Tail calls**: Allows a tool to "link" to another action. For example, a
  shell command that produces an error can automatically trigger a "diagnostic"
  tool without returning control to the main model.
- **Parallelism**: The scheduler executes independent read-only tools in
  parallel while enforcing sequential execution for tools that modify the
  environment.
- **MCP integration**: Dynamically loads tools from Model Context Protocol
  servers, integrating them seamlessly into the same policy and scheduler
  framework.

---

## 5. UI and terminal integration

The `packages/cli/src/ui` directory implements a sophisticated React-based TUI.

### Keyboard and protocols
- **KeypressProvider**: Manages terminal input, supporting complex key
  combinations and shortcuts.
- **Kitty keyboard protocol**: Detects terminals that support the Kitty
  protocol to enable advanced features like detecting `ctrl+enter` vs `enter`.
- **Vim mode**: A dedicated provider that enables Vim-like navigation (hjkl,
  words, search) for both conversation history and input fields.

### Layout and rendering
- **ResizeObserver**: A custom implementation that watches the terminal size
  to ensure components (like multi-column layouts or wide tables) adapt
  instantly.
- **ConsolePatcher**: Intercepts `console.log`, `console.warn`, and
  `console.error`, routing them to the internal debug console (toggled with
  `ctrl+d`) or the external DevTools server.

---

## 6. Testing and validation

Gemini CLI uses a tiered testing strategy to ensure reliability:
1.  **Unit tests**: Located alongside the source (`*.test.ts`), providing fast
    coverage for core logic.
2.  **Integration tests**: Located in `integration-tests/`, running the
    full CLI against mock and real Gemini API endpoints.
3.  **Evals**: Performance benchmarks in `evals/` that measure the agent's
    reasoning accuracy and tool-use efficiency over time.
