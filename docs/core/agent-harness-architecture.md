# Agent harness architecture

This document provides a detailed walkthrough of the architectural shift from
linear turn-based execution to the unified hierarchical loop model used by the
Agent Harness.

> **Note:** This is a preview feature currently under active development.

## Overview

The Agent Harness represents a fundamental evolution in how Gemini CLI manages
interactions with Large Language Models (LLMs) and tools. It unifies the
execution logic for both the main CLI agent and subagents, providing parity in
features like model routing, history management, and tool execution.

## Legacy architecture: Linear turns

The legacy system operates on a "Stop-and-Go" model where the UI manages the
execution turn-by-turn.

In this model, when you send a prompt, the system follows these steps:

1.  **Orchestration:** The `GeminiClient` and the `useGeminiStream` hook manage
    the flow.
2.  **Execution:** Gemini returns a single response containing text or tool
    calls.
3.  **UI Interruption:** The execution stops at the UI layer. If Gemini calls
    tools, the UI schedules them, waits for results, and then re-submits the
    entire history as a brand-new turn.
4.  **Subagents:** Subagents are treated as "Black Box" tools. The main agent
    calls a subagent (for example, `codebase_investigator`), waits for it to
    complete its private loop using `LocalAgentExecutor`, and receives a single
    string result.

This model results in duplicated logic for subagents and prevents them from
using advanced features available to the main agent.

## New architecture: Unified agent harness

The Agent Harness treats the ReAct (Reasoning and Action) loop as a first-class,
autonomous process.

The new model introduces several key improvements:

1.  **Continuous Loop:** The `AgentHarness` manages the entire lifecycle
    internally. It handles LLM calls, tool execution, and reasoning without
    relinquishing control to the UI until it reaches the final goal.
2.  **Event Stream:** The harness yields a continuous stream of events
    (`GeminiEvent`) that the UI listens to and renders in real-time.
3.  **Hierarchical Delegation:** Because the harness is unified, a subagent is
    simply another instance of `AgentHarness` running inside a tool call of the
    parent harness.
4.  **Feature Parity:** Subagents can now use the same features as the main
    agent, including dynamic model routing, history compression, and complex
    interactive tools.

## UI synchronization challenges

Moving to a hierarchical model introduces complexity in how the UI maintains a
consistent history.

The `HistoryManager` expects a flat list of messages, but the harness provides a
nested, multi-turn stream. This creates two primary challenges:

1.  **History Persistence:** Legacy code may clear the "active" turn state
    prematurely when a turn boundary is crossed. The harness uses a
    `TurnFinished` event to signal when to "lock in" reasoning without ending
    the overall session.
2.  **Hierarchical Boxes:** In a hierarchical model, internal subagent tool
    calls (for example, reading a file) shouldn't clutter the main history. The
    UI uses `SubagentActivity` events to update a single, persistent subagent
    box rather than rendering every internal step as a top-level item.

## Isolation strategy

To ensure stability during this transition, the project uses a "Dual
Implementation" strategy.

This strategy isolates the experimental logic from the stable codebase:

- **Hook Isolation:** `useAgentHarness.ts` provides a dedicated hook for the new
  event model, leaving the stable `useGeminiStream` untouched.
- **Logic Isolation:** `HarnessSubagentInvocation.ts` manages subagent execution
  specifically for the harness, while `LocalSubagentInvocation.ts` continues to
  serve the legacy path.
- **Conditional Forking:** The system switches between these paths based on the
  `experimental-agent-harness` configuration flag.
