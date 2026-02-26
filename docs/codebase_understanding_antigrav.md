# Gemini CLI - Codebase Understanding

Gemini CLI is an open-source AI agent designed to let you interact with Google's
Gemini models directly from your terminal. It's built as a **TypeScript
monorepo** (using npm workspaces) and relies heavily on **Node.js**, **React**,
and **Ink** (a library that lets you build terminal UIs using React components).

Here is a high-level walkthrough of the repository to help you understand how
all the pieces fit together.

## 1. High-Level Architecture (The `packages/` Directory)

The project is split into several focused packages to maintain a clean
separation of concerns:

- **`packages/cli`** (The Frontend)
  - This is the user-facing terminal UI.
  - It uses React + Ink. This means the terminal layout, styling, and
    interactions are managed like a modern web app (with hooks, contexts, and
    components).
  - It handles all the terminal-specific logic like key bindings, processing
    mouse/keyboard events, and rendering the chat stream or tool progress
    indicators.
- **`packages/core`** (The Brain/Backend)
  - This is where the actual "agentic" logic lives. It is entirely UI-agnostic.
  - Contains the core looping mechanism that communicates with the Gemini API,
    maintains conversation history, compresses context, and evaluates whether
    the agent needs to invoke a tool.
  - Houses the **Tool Registry** (file system tools, shell runner, web tools)
    and the **Policy Engine** (deciding if a tool is safe to run automatically
    or needs your permission).
- **`packages/devtools`**
  - A Chrome DevTools-like web server that runs locally! If you enable
    `general.devtools` in your settings, you can inspect network requests, agent
    thoughts, and console logs in a local browser, just like you would for a web
    app.
- **`packages/vscode-ide-companion`**
  - A VS Code extension that pairs dynamically with the CLI. It allows the
    terminal agent to "read" your active editor state, seamlessly pulling
    context on exactly what files or lines of code you currently have
    highlighted in VS Code.
- **`packages/sdk`**
  - Provides libraries and types so people can build custom MCP (Model Context
    Protocol) extensions or tools for the CLI.
- **`packages/a2a-server`**
  - An experimental Agent-to-Agent server, hinting at future capabilities for
    having different agents talk to each other.

## 2. The Core Application Lifecycle

When you type `gemini` in your terminal, here's roughly what happens under the
hood:

1.  **Bootstrapping (`packages/cli/src/gemini.tsx`)**: The CLI loads user
    configurations, parses command-line arguments, checks authentication, and
    verifies if it needs to launch itself in a controlled "sandbox" environment
    (using Docker/Podman to isolate dangerous shell tools).
2.  **Mode Resolution**: It determines if you are piping data in or running a
    single command (`nonInteractiveCli.ts`), or if you are firing up the chat
    TUI (Terminal User Interface).
3.  **The Agent Loop (`packages/core/src/core/`)**:
    - **`GeminiClient`**: The main orchestrator. It manages sessions and
      compresses chat histories using `ChatCompressionService` so you don't
      breach token limits.
    - **`GeminiChat` & `Turn`**: For every prompt you send, a `Turn` is created.
      This represents one "exchange" where the model might think, respond, and
      realize it needs to search your codebase. It streams these requests back
      in real-time.

## 3. The Tool System & Execution

The most powerful aspect of this CLI is its ability to interact with your
environment.

- In `packages/core/src/tools/`, there are native TypeScript implementations for
  operations (like reading files, searching directories, or running tests).
- When Gemini asks to use a tool, the **Scheduler**
  (`packages/core/src/scheduler/`) intercepts the request.
- It runs the request through the **Policy Engine**
  (`packages/core/src/policy/`). Some commands (like `rm -rf`) are flagged and
  routed to a **Confirmation Bus**, which pauses execution and asks you in the
  UI: _"Do you want to allow this command?"_
- Once approved (or auto-approved), it executes the tool, captures standard
  output/error, and pipes that text back to Gemini to continue its thought
  process.

## 4. Code Quality, Building, and Testing

- **Bundling & Running**: The project uses `esbuild` to compile everything very
  quickly. During development, you can use `npm run start` or `npm run debug`
  (which attaches a Node.js inspector).
- **Testing (`vitest`)**: Testing is extremely rigorous here.
  - _Unit Tests:_ `npm run test` handles basic component functionality.
  - _Integration Tests:_ `npm run test:e2e` simulates an actual sandbox,
    mocking/hitting models to make sure the CLI interacts realistically.
  - _Evals (`evals/`):_ Standalone performance benchmarks where they evaluate
    how smart the CLI is at navigating codebases or using its tools
    autonomously.
- **`npm run preflight`**: Before a PR is pushed, this massive script runs
  formatting (Prettier), linting (ESLint), type checking (TypeScript), unit
  testing, and building, ensuring nothing breaks the main branch.
