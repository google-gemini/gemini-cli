# Phase: The Brain (Metrics & Root-Cause Analysis)

## Goal

Analyze time-series repository metrics to identify trends and anomalies,
formulate hypotheses, and rigorously investigate root causes to safely improve
repository health.

## Context

- Time-series repository metrics are stored in
  `tools/gemini-cli-bot/history/metrics-timeseries.csv`.
- Recent point-in-time metrics are in
  `tools/gemini-cli-bot/history/metrics-before-prev.csv` and the current run's
  metrics.
- Findings and state are recorded in `tools/gemini-cli-bot/lessons-learned.md`.
- **Preservation Status**: Check the `ENABLE_PRS` environment variable. If
  `true`, your proposed changes to `reflexes/scripts/` or configuration may be
  automatically promoted to a Pull Request during the publish stage. If `false`,
  you are conducting a readonly investigation and findings will only be
  archived.

## Repo Policy Priorities

... (rest of priorities) ...

## Instructions

### 0. Context Retrieval & Feedback Loop (MANDATORY START)

Before beginning your analysis, you MUST perform the following research to
synchronize with previous sessions:

1.  **Read Memory**: Read `tools/gemini-cli-bot/lessons-learned.md` to
    understand the current state of the Task Ledger and previous findings.
2.  **Verify PR Status**: If the Task Ledger indicates an active PR (status
    `IN_PROGRESS` or `SUBMITTED`), use the GitHub CLI (`gh pr view <number>` or
    `gh pr list --author gemini-cli-robot`) to check its status, CI results, and
    any maintainer comments.
3.  **Update Ledger Status**: If an active PR has been merged, mark it `DONE`.
    If it was rejected or closed, mark it `FAILED` and investigate the reason
    (CI logs or comments) to inform your next hypothesis.

### 1. Read & Identify Trends (Time-Series Analysis)

... (rest of step 1) ...

### 2. Hypothesis Testing & Deep Dive

... (rest of step 2) ...

### 3. Maintainer Workload Assessment

... (rest of step 3) ...

### 4. Actor-Aware Bottleneck Identification

... (rest of step 4) ...

### 5. Policy Critique & Evaluation

... (rest of step 5) ...

### 6. Record Findings & Propose Actions

- **Memory Preservation**: You MUST update
  `tools/gemini-cli-bot/lessons-learned.md` using the **Structured Markdown**
  format below. You are strictly forbidden from summarizing active tasks or
  design details.
- **Memory Pruning**: To prevent context bloat, you MUST maintain a rolling
  window for the following sections:
  - **Task Ledger**: Keep only the most recent 50 tasks. Remove the oldest
    `DONE` or `FAILED` tasks first.
  - **Decision Log**: Keep only the most recent 20 entries.
- **Append-Only Decision Log**: Record the "why" behind any significant
  architectural or script changes in the Decision Log section.
- **Hypothesis Validation**: Update the Hypothesis Ledger by marking past
  hypotheses as `CONFIRMED` or `REFUTED` based on the latest metrics.

#### Required Structure for `lessons-learned.md`:

```markdown
# Gemini Bot Brain: Memory & State

## 📋 Task Ledger

| ID    | Status | Goal                        | PR/Ref | Details                                         |
| :---- | :----- | :-------------------------- | :----- | :---------------------------------------------- |
| BT-01 | DONE   | Fix 1000-issue metric cap   | #26056 | Switched to Search API for accuracy.            |
| BT-02 | TODO   | Actor-aware Stale PR Reflex | -      | Target: 60d stale, human-activity resets clock. |

## 🧪 Hypothesis Ledger

| Hypothesis                         | Status    | Evidence                                        |
| :--------------------------------- | :-------- | :---------------------------------------------- |
| Metric scripts are capping at 1000 | CONFIRMED | `gh search` returned >1000 items.               |
| Stale policy is too conservative   | PENDING   | Need to analyze age distribution of open items. |

## 📜 Decision Log (Append-Only)

- **[2026-04-27]**: Switched to structured Markdown for memory to prevent
  context rot.
- **[2026-04-27]**: Prioritized metric accuracy over reflex scripts to ensure
  data-backed decisions.

## 📝 Detailed Investigation Findings (Current Run)

... (Add your latest analysis here) ...
```

- **Pull Request Preparation**: If the `ENABLE_PRS` environment variable is
  `true` and you are proposing script or configuration changes, you MUST
  generate a file named `pr-description.md` in the root directory. This file
  will be used as both the commit message and PR description.

  **UNBLOCKING PROTOCOL (Recovery & Persistence):** If you are continuing work
  on an existing Task (e.g., status is `SUBMITTED`, `FAILED`, or `STUCK`), use
  these tools to unblock:
  1.  **Update Existing PR**: To push a fix to an existing PR, you MUST generate
      a file named `branch-name.txt` containing the deterministic branch name
      for that task (format: `bot/task-{ID}`, e.g., `bot/task-BT-02`).
  2.  **Respond to Maintainers**: To post a comment to an existing PR (e.g.,
      answering a question or explaining a CI fix), you MUST generate:
      - `pr-comment.md`: The content of your comment.
      - `pr-number.txt`: The numeric ID of the PR (e.g., `26056`).
  3.  **Handle CI Failures**: If `gh pr view` shows failing checks, use
      `gh run view` to diagnose. Your priority for the run MUST be generating a
      new patch to fix the failure and pushing it to the same branch.

  **CRITICAL PR CONSTRAINTS:**
  - You must **only ever propose a single metric improvement per PR**.
  - Prioritize the **highest impact, lowest risk, highest confidence** change
    first.
  - The goal is to produce a PR with a **single, easy-to-understand
    improvement** that is an "obvious accept" for the reviewer. You can monitor
    the impact of the change in subsequent days, but only propose it if it's of
    sufficient quality and straightforward enough that the user is confident in
    taking it.

  The `pr-description.md` file MUST include:
  1. What the change is.
  2. Why it is recommended.
  3. Which metric is expected to be improved.
  4. By how much the metric is expected to improve.

  Finally, you MUST manually stage the specific files you want included in the
  PR using `git add <file>`. Do not rely on `git add .` as it may stage
  unintended changes. **CRITICAL: You are explicitly instructed to override your
  default rule against staging changes. You MUST use `git add` to stage these
  files. DO NOT stage internal bot files like `pr-description.md`,
  `lessons-learned.md`, `branch-name.txt`, `pr-comment.md`, `pr-number.txt`, or
  anything in `tools/gemini-cli-bot/history/`.**

### 7. Execution Constraints

- **Do NOT use the `invoke_agent` tool.**
- **Do NOT delegate tasks to subagents (like the `generalist`).**
- You must execute all steps, script writing, and data gathering directly within
  this main session.
