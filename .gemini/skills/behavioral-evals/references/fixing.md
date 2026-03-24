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
4.  **Diagnose**: Audit tool logs and telemetry. Note if due to setup/assert.
    - **Tip**: Proactively add custom logging/diagnostics to check hypotheses.

---

## 2. 🛠️ Fix Strategy

1.  **Targeted Location**: Locate the test case and the corresponding
    prompt/code.
2.  **Iterative Scope**: Make extreme change first to verify scope, then refine
    to a minimal, targeted change.
3.  **Assertion Fidelity**:
    - Changing the test prompt is a **last resort** (prompts are often vague by
      design).
    - **Warning**: Do not lose test fidelity by making prompts too direct/easy.
    - **Primary Fix Trigger**: Adjust tool descriptions, system prompts
      (`snippets.ts`), or **modules that contribute to the prompt template**.
    - **Warning**: Prompts have multiple configurations; ensure your fix targets
      the correct config for the model in question.
4.  **Architecture Options**: If prompt or instruction tuning triggers no
    improvement, analyze loop composition.
    - **AgentLoop**: Defined by `context + toolset + prompt`.
    - **Enhancements**: Loops perform best with direct prompts, fewer irrelevant
      tools, low goal density, and minimal low-value/irrelevant context.
    - **Modifications**: Compose subagents or isolate tools. Ground in observed
      traces.
    - **Warning**: Think deeply before offering recommendations; avoid parroting
      abstract design guidelines.

---

## 3. ✅ Verify

1.  **Run Local**: Run Vitest in non-interactive mode on just the file.
2.  **Log Audit**: Prioritize diagnosing failures via log comparison before
    triggering heavy test runs.
3.  **Stability Limit**: Run the test **3 times** locally on key models (can use
    scripts to run in parallel for speed):
    - **Gemini 3.0**
    - **Gemini 3 Flash**
    - **Gemini 2.5 Pro**
4.  **Flakiness Rule**: If it passes 2/3 times, it may be inherent noise
    difficult to improve without a structural split.

---

## 4. 📊 Report

Provide a summary of:

- Test success rate for each tested model (e.g., 3/3 = 100%).
- Root cause identification and fix explanation.
- If unfixed, provide high-confidence architecture recommendations.
