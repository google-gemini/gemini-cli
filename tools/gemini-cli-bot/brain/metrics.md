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

- Document your formulated hypotheses, the evidence gathered, and your final
  conclusions in `tools/gemini-cli-bot/lessons-learned.md`.
- **Memory Preservation**: When updating `lessons-learned.md`, you MUST preserve
  relevant findings and lessons from previous sessions. Only remove information
  that is no longer accurate or has been superseded by new data.
- Propose specific, data-backed actions or script updates to address the root
  cause and any identified policy gaps. Ensure proposed actions align with the
  Repo Policy Priorities and include concepts like graceful closures and
  terminal escalations to prevent spam.
- Recommend specific changes to GitHub Workflows, Triage scripts, or repository
  `CONTRIBUTING.md`/`GEMINI.md` guidelines.
- **Pull Request Preparation**: If the `ENABLE_PRS` environment variable is
  `true` and you are proposing script or configuration changes, you MUST
  generate a file named `pr-description.md` in the root directory. This file
  will be used as both the commit message and PR description. **CRITICAL PR
  CONSTRAINTS:**
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
  `lessons-learned.md`, or anything in `tools/gemini-cli-bot/history/`.**

### 7. Execution Constraints

- **Do NOT use the `invoke_agent` tool.**
- **Do NOT delegate tasks to subagents (like the `generalist`).**
- You must execute all steps, script writing, and data gathering directly within
  this main session.
