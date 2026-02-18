# Core concepts

This guide explains the fundamental concepts and terminology used throughout the
Gemini CLI ecosystem. Understanding these terms will help you make the most of
the tool's capabilities.

## Approval mode

**Approval mode** determines the level of autonomy you grant to the agent when
executing tools.

- **Default:** The agent asks for confirmation before performing any potentially
  impactful action (like writing files or running shell commands).
- **Auto-edit:** File modifications are applied automatically, but shell
  commands still require confirmation.
- **YOLO (You Only Look Once):** The agent runs all tools without asking for
  permission. High risk, high speed.

## Checkpointing

**Checkpointing** is a safety feature that automatically snapshots your
project's file state before the agent performs any destructive action (like
writing a file).

- **Snapshots:** Stored in a hidden Git repository (separate from your project's
  Git history).
- **Restore:** Allows you to instantly revert changes if the agent makes a
  mistake, using the `/restore` command.

## Context

**Context** refers to the information the agent has about your current task and
environment. Gemini CLI provides context through several mechanisms:

- **Conversation history:** The chat log of the current session.
- **Project context (`GEMINI.md`):** Persistent instructions and rules defined
  in your project's root or subdirectories.
- **File content:** Files you explicitly reference (e.g., `@src/app.ts`) or that
  the agent reads using tools.
- **Environment:** Information about your operating system, shell, and working
  directory.

Effective context management is key to getting accurate and relevant responses.

## Extension

An **Extension** is a pluggable package that adds new capabilities to Gemini
CLI. Extensions can bundle:

- **Skills:** Specialized procedural knowledge.
- **MCP Servers:** Connections to external tools and data.
- **Commands:** Custom slash commands.

## Headless mode

**Headless mode** refers to running Gemini CLI without the interactive terminal
UI (TUI). This is used for scripting, automation, and piping data into or out of
the agent.

- **Interactive:** `gemini` (starts the REPL).
- **Headless:** `gemini "Fix this file"` (runs once and exits).

## Hook

A **Hook** is a script or function that intercepts specific lifecycle events in
the CLI.

- **Use cases:** Logging tool usage, validating user input, or modifying the
  agent's system prompt dynamically.
- **Lifecycle:** Hooks can run before or after the agent starts, before tools
  are executed, or after the session ends.

## Model Context Protocol (MCP)

The **Model Context Protocol (MCP)** is an open standard that allows Gemini CLI
to connect to external data sources and tools.

- **MCP Server:** A lightweight application that exposes resources (data) and
  tools (functions) to the CLI.
- **Use case:** Connecting Gemini to a PostgreSQL database, a GitHub repository,
  or a Slack workspace without building custom integration logic into the CLI
  core.

## Policy engine

The **Policy Engine** is the security subsystem that enforces rules on tool
execution. It evaluates every tool call against your configuration (e.g.,
[Trusted folders](#trusted-folders), allowed commands) to decide whether to:

- Allow the action immediately.
- Require user confirmation.
- Block the action entirely.

## Sandboxing

**Sandboxing** is an optional security mode that isolates the agent's execution
environment. When enabled, the agent runs inside a secure container (e.g.,
Docker), preventing it from accessing sensitive files or system resources
outside of the designated workspace.

## Session

A **Session** is a single continuous interaction thread with the agent.

- **State:** Sessions maintain conversation history and short-term memory.
- **Persistence:** Sessions are automatically saved, allowing you to pause,
  resume, or rewind them later.

## Skill

A **Skill** (or **Agent Skill**) is a package of specialized expertise that the
agent can load on demand. Unlike general context, a skill provides specific
procedural knowledge for a distinct task.

- **Example:** A "Code Reviewer" skill might contain a checklist of security
  vulnerabilities to look for and a specific format for reporting findings.
- **Activation:** Skills are typically activated dynamically when the agent
  recognizes a matching request.

## Tool

A **Tool** is a specific function or capability that the agent can execute.
Tools allow the AI to interact with the outside world.

- **Built-in tools:** Core capabilities like `read_file`, `run_shell_command`,
  and `google_web_search`.
- **MCP tools:** External tools provided by
  [MCP servers](#model-context-protocol-mcp).

When the agent uses a tool, it pauses generation, executes the code, and feeds
the output back into its context window.

## Trusted folders

**Trusted folders** are specific directories you have explicitly authorized the
agent to access without repeated confirmation prompts. This is a key component
of the [Policy engine](#policy-engine) to balance security and usability.
