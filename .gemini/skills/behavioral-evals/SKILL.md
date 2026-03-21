---
name: behavioral-evals
description: Guidance for creating, running, fixing, and promoting behavioral evaluations. Use when verifying agent decision logic, debugging failures, debugging prompt steering, or adding workspace regression tests.
---

# Behavioral Evals

## Overview

Behavioral evaluations (evals) are tests that validate the agent's decision-making (e.g., tool choice) rather than pure functionality. They are critical for testing prompt changes and preventing regressions.

---

## 🔄 Workflow Decision Tree

1.  **Does a prompt/tool change need validation?**
    *   *No* -> Normal integration tests.
    *   *Yes* -> Continue below.
2.  **Is it UI/Interaction heavy?**
    *   *Yes* -> Use `appEvalTest` (`AppRig`). See [creating.md](references/creating.md).
    *   *No* -> Use `evalTest` (`TestRig`). See [creating.md](references/creating.md).
3.  **Is it a new test?**
    *   *Yes* -> Set policy to `USUALLY_PASSES`.
    *   *No* -> `ALWAYS_PASSES` (locks in regression).
4.  **Are you fixing a failure or promoting a test?**
    *   *Fixing* -> See [fixing.md](references/fixing.md).
    *   *Promoting* -> See [promoting.md](references/promoting.md).

---

## 📋 Step-by-Step Checklist

### 1. Setup Workspace
Seed the workspace with necessary files using the `files` object in your eval case to simulate a realistic scenario.

### 2. Write Assertions
Use assertions that audit agent decisions:
*   **Breakpoints**: Pause *before* tools using `rig.setBreakpoint(['tool_name'])`.
*   **Tool Tracing**: Audit history via `rig.readToolLogs()`.

> Detailed patterns in [creating.md](references/creating.md)

### 3. Verify Pass Rate
Before pushing, run the test multiple times locally to assess flakiness.

> CLI commands in [running.md](references/running.md)

---

## 📦 Bundled Resources

### references/
*   **[creating.md](references/creating.md)**: Detailed guide on `TestRig` vs `AppRig`, assertions, and breakpoints.
*   **[running.md](references/running.md)**: CLI commands for running evals and explanation of promotion lifecycle.
*   **[fixing.md](references/fixing.md)**: Troubleshooting workflows for debugging test regressions.
*   **[promoting.md](references/promoting.md)**: Criteria and steps for promoting incubated tests.

### assets/
*   **`standard_eval.ts.txt`**: Boilerplate for standard workspace/CLI tests (uses `evalTest` and trajectory auditing).
*   **`interactive_eval.ts.txt`**: Boilerplate for UI/Interaction tests (uses `appEvalTest` and breakpoints).

