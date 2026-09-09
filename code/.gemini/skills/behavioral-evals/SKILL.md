---
name: behavioral-evals
description: Guidance for creating, running, fixing, and promoting behavioral evaluations. Use when verifying agent decision logic, debugging failures, debugging prompt steering, or adding workspace regression tests.
---

# Behavioral Evals

## Overview

Behavioral evaluations (evals) are tests that validate the **agent's decision-making** (e.g., tool choice) rather than pure functionality. They are critical for verifying prompt changes, debugging steerability, and preventing regressions.

> [!NOTE]
> **Single Source of Truth**: For core concepts, policies, running tests, and general best practices, always refer to **[evals/README.md](file:///Users/abhipatel/code/gemini-cli/docs/evals/README.md)**.

---

## 🔄 Workflow Decision Tree

1.  **Does a prompt/tool change need validation?**
    *   *No* -> Normal integration tests.
    *   *Yes* -> Continue below.
2.  **Is it UI/Interaction heavy?**
    *   *Yes* -> Use `appEvalTest` (`AppRig`). See **[creating.md](references/creating.md)**.
    *   *No* -> Use `evalTest` (`TestRig`). See **[creating.md](references/creating.md)**.
3.  **Is it a new test?**
    *   *Yes* -> Set policy to `USUALLY_PASSES`.
    *   *No* -> `ALWAYS_PASSES` (locks in regression).
4.  **Are you fixing a failure or promoting a test?**
    *   *Fixing* -> See **[fixing.md](references/fixing.md)**.
    *   *Promoting* -> See **[promoting.md](references/promoting.md)**.

---

## 📋 Quick Checklist

### 1. Setup Workspace
Seed the workspace with necessary files using the `files` object to simulate a realistic scenario (e.g., NodeJS project with `package.json`).
*   *Details in **[creating.md](references/creating.md)***

### 2. Write Assertions
Audit agent decisions using `rig.setBreakpoint()` (AppRig only) or index verification on `rig.readToolLogs()`.
*   *Details in **[creating.md](references/creating.md)***

### 3. Verify
Run single tests locally with Vitest. Confirm stability locally before relying on CI workflows.
*   *See **[evals/README.md](file:///Users/abhipatel/code/gemini-cli/docs/evals/README.md)** for running commands.*

---

## 📦 Bundled Resources

Detailed procedural guides:
*   **[creating.md](references/creating.md)**: Assertion strategies, Rig selection, Mock MCPs.
*   **[fixing.md](references/fixing.md)**: Step-by-step automated investigation, architecture diagnosis guidelines.
*   **[promoting.md](references/promoting.md)**: Candidate identification criteria and threshold guidelines.

