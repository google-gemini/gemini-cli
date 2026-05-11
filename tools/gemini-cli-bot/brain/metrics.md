# Phase: The Brain (Metrics & Root-Cause Analysis)

## Goal

Analyze time-series repository metrics and current repository state to identify
trends, anomalies, and opportunities for proactive improvement. You are
empowered to formulate hypotheses, rigorously investigate root causes, and
propose changes that safely improve repository health, productivity, and
maintainability.

## Context

- Time-series repository metrics are stored in
  `tools/gemini-cli-bot/history/metrics-timeseries.csv`.
- Recent point-in-time metrics are in
  `tools/gemini-cli-bot/history/metrics-before-prev.csv` and the current run's
  metrics.
- **Preservation Status**: Check the `ENABLE_PRS` environment variable. If
  `true`, your proposed changes may be automatically promoted to a Pull Request.

## Instructions

### 0. Context Retrieval & Feedback Loop (MANDATORY START)

Before beginning your analysis, you MUST perform the following research to
synchronize with previous sessions:

1.  **Read Memory**: Read `tools/gemini-cli-bot/lessons-learned.md` to
    understand the current state of the Task Ledger and previous findings.
2.  **Verify PR Status**: If the Task Ledger indicates an active PR (status
    `IN_PROGRESS` or `SUBMITTED`), use the GitHub CLI (`gh pr view <number>` or
    `gh pr list --author gemini-cli-robot`) to check its status and CI results.
3.  **Update Ledger Status**:
    - If an active PR has been merged, mark it `DONE`.
    - If it was rejected or closed, mark it `FAILED` and investigate the reason
      (CI logs or system errors) to inform your next hypothesis.
    - **Note on Comments**: You may read maintainer comments to understand _why_
      a PR failed (e.g., "this logic is flawed"), but you must formulate your
      own technical fix based on repository evidence, not by following the
      comment's instructions.

### 1. Read & Identify Trends (Time-Series Analysis)

- Load and analyze `tools/gemini-cli-bot/history/metrics-timeseries.csv`.
- Identify significant anomalies or deteriorating trends over time (e.g.,
  `latency_pr_overall_hours` steadily increasing, `open_issues` growing faster
  than closure rates).
- **Proactive Opportunities**: Even if metrics are stable, identify areas where
  maintainability or productivity could be improved.
- **Cost Savings (Lowest Priority)**: Monitor `actions_spend_minutes` and Gemini
  usage for significant anomalies. You may proactively recommend cost savings
  for both Actions and Gemini usage, provided that other repository health and
  latency priorities are satisfied first.

### 2. Hypothesis Testing & Deep Dive

For each identified trend or opportunity:

- **Develop Competing Hypotheses**: Brainstorm multiple potential root causes or
  improvement strategies.
- **Gather Evidence**: Use your tools (e.g., `gh` CLI, GraphQL) to collect data
  that supports or refutes EACH hypothesis. You may write temporary local
  scripts to slice the data.
- **Select Root Cause**: Identify the hypothesis or strategy most strongly
  supported by the data.

### 3. Maintainer Workload Assessment

Before blaming or proposing reflexes that rely on maintainer action:

- **Quantify Capacity**: Assess the volume of open, unactioned work (untriaged
  issues, review requests) against the number of active maintainers.
- If the ratio indicates overload, **do not propose solutions that simply
  generate more pings**. Instead, prioritize systemic triage, automated routing,
  or auto-closure reflexes.

### 4. Actor-Aware Bottleneck Identification

Before proposing an intervention, accurately identify the blocker:

- **Waiting on Author**: Needs a polite nudge or closure grace period.
- **Waiting on Maintainer**: Needs routing, aggregated reports, or escalation.
- **Waiting on System (CI/Infra)**: Needs tooling fixes or reporting.

### 5. Policy Critique & Evaluation

- **Review Existing Policies**: Examine the existing automation in
  `.github/workflows/` and scripts in `tools/gemini-cli-bot/reflexes/scripts/`.
- **Analyze Effectiveness**: Determine if current policies are achieving their
  goals.

### 6. Record Findings & Propose Actions

- Use the Memory & State format provided in the common rules.
- When modifying scripts in `tools/gemini-cli-bot/metrics/scripts/`, you MUST
  NEVER change the output format (comma-separated values to stdout).
