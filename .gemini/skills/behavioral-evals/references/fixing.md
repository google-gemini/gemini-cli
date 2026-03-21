# Fixing Behavioral Evals

Use this guide when asked to debug, troubleshoot, or fix a failing behavioral
evaluation.

---

## 1. 🔍 Investigate

1.  **Fetch Nightly Results**: Use the `gh` CLI to inspect the latest run from
    `evals-nightly.yml` if applicable.
    - _Example view URL_:
      `https://github.com/google-gemini/gemini-cli/actions/workflows/evals-nightly.yml`
2.  **Isolate**: DO NOT push changes or start remote runs. Confine investigation
    to the local workspace.
3.  **Read Logs**:
    - Eval logs live in `evals/logs/<test_name>.log`.
    - Enable verbose debugging via `export GEMINI_DEBUG_LOG_FILE="debug.log"`.
4.  **Diagnose**: Audit tool logs and telemetry. Note if the failure is on tool
    pick, setup, or assert.

---

## 2. 🛠️ Fix Strategy

1.  **Targeted Location**: Locate the test case and the corresponding
    prompt/code.
2.  **Iterative Scope**: Make extreme change first to verify scope, then refine
    to a minimal, targeted change.
3.  **Assertion Fidelity**:
    - Changing the test prompt should be a **last resort**. The prompts are
      often vague _by design_ to test adaptability.
    - **Primary Fix Trigger**: Adjust **tool descriptions**, **system prompts
      (snippets)**, or **subagent instructions**.
4.  **Architecture Options**:
    - If prompt tuning fails, consider breaking down the task using multiple
      agent loops (Context + Toolset + Prompt) or composting subagents.

---

## 3. ✅ Verify

1.  **Run Local**: Run just the single test using `npx vitest run`.
2.  **Avoid Loops**: Minimize test runs to save time/quota.
3.  **Assure Stability**: Run the test **3 times** across variation models
    (e.g., Flash, Pro) to confirm consistency.
4.  **Flakiness Rule**: If it passes 2/3 times, it may be transient flakiness
    inherently unable to improve.

---

## 4. 📊 Report

Provide a summary of:

- Test success rate for each tested model (e.g., 3/3 = 100%).
- Root cause identification and fix explanation.
- If unfixed, provide high-confidence architecture recommendations.
