# Phase: Metrics Investigation & Root-Cause Analysis

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

## Repo Policy Priorities

When analyzing data and proposing solutions, prioritize the following in order:

1.  **Security & Quality**: Security fixes, product quality, and release
    blockers.
2.  **Maintainer Workload**: Keeping a manageable and focused workload for core
    maintainers.
3.  **Community Collaboration**: Working effectively with the external
    contributor community, maintaining a close collaborative relationship, and
    treating them with respect.

## Instructions

### 1. Read & Identify Trends (Time-Series Analysis)

- Load and analyze `tools/gemini-cli-bot/history/metrics-timeseries.csv`.
- Identify significant anomalies or deteriorating trends over time (e.g.,
  `latency_pr_overall_hours` steadily increasing, `open_issues` growing faster
  than closure rates, spikes in `review_distribution_variance`).

### 2. Hypothesis Testing & Deep Dive

For each metric not meeting goals or showing a negative trend:

- **Develop Competing Hypotheses**: Brainstorm multiple potential root causes
  (e.g., "PR Latency is high because CI is flaky" vs. "PR Latency is high
  because reviewers are unresponsive").
- **Gather Evidence**: Use your tools (e.g., `gh` CLI, GraphQL) to collect data
  that supports or refutes EACH hypothesis. You may write temporary local
  scripts to slice the data (e.g., checking issue labels, ages, or assignees).
- **Select Root Cause**: Identify the hypothesis most strongly supported by the
  data.
- **Prioritize Impact**: Always prioritize solving for verified hypotheses that
  have the largest impact (e.g., if 30 out of 500 PRs have merge conflicts,
  fixing merge conflicts is lower priority than addressing a bottleneck
  affecting 300 PRs).

### 3. Maintainer Workload Assessment

Before blaming or proposing processes that rely on maintainer action (e.g., more
triage, more reviews):

- **Quantify Capacity**: Assess the volume of open, unactioned work (untriaged
  issues, review requests) against the number of active maintainers.
- If the ratio indicates overload, **do not propose solutions that simply
  generate more pings**. Instead, prioritize systemic triage, automated routing,
  or auto-closure processes.

### 4. Actor-Aware Bottleneck Identification

Before proposing an intervention, accurately identify the blocker:

- **Waiting on Author**: Needs a polite nudge or closure grace period.
- **Waiting on Maintainer**: Needs routing, aggregated reports, or escalation
  (do not nudge the author).
- **Waiting on System (CI/Infra)**: Needs tooling fixes or reporting.

### 5. Record Findings & Propose Actions

- Document your formulated hypotheses, the evidence gathered, and your final
  conclusions in `tools/gemini-cli-bot/lessons-learned.md`.
- Propose specific, data-backed actions or script updates to address the root
  cause. Ensure proposed actions align with the Repo Policy Priorities and
  include concepts like graceful closures and terminal escalations to prevent
  spam.

### 6. Execution Constraints

- **Do NOT use the `invoke_agent` tool.**
- **Do NOT delegate tasks to subagents (like the `generalist`).**
- You must execute all steps, script writing, and data gathering directly within
  this main session.
