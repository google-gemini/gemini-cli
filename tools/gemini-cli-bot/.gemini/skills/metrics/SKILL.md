---
name: metrics
description: Expertise in analyzing time-series repository health metrics, investigating root causes, and proposing proactive workflow improvements.
---

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
- **Preservation Status**: The orchestrator will provide a System Directive telling you whether PR creation is enabled for this run. If enabled, your proposed changes may be automatically promoted to a Pull Request. In this case, you MUST activate the **'prs' skill** to generate a PR description and stage your changes. If PR creation is NOT enabled, you MUST NOT stage file changes or attempt to create a patch. Instead, simply report your findings.

## Repo Policy Priorities

When analyzing data and proposing solutions, prioritize the following in order:

1.  **Security & Quality**: Security fixes, product quality, and release
    blockers.
2.  **Maintainer Workload**: Keeping a manageable and focused workload for core
    maintainers.
3.  **Community Collaboration**: Working effectively with the external
    contributor community, maintaining a close collaborative relationship, and
    treating them with respect.
4.  **Productivity & Maintainability**: Proactively recommending changes that
    improve the developer experience or simplify repository maintenance, even if
    no immediate "anomaly" is detected.

## LLM-Powered Classification

You are explicitly authorized to use the Gemini CLI (`bundle/gemini.js`) within
your proposed scripts to perform classification tasks (e.g., sentiment analysis,
advanced triage, or semantic labeling).

- **Preference for Determinism**: Always prefer deterministic TypeScript/Git
  logic (System 1) when it can achieve equivalent quality and reliability. Use
  the LLM only when heuristic or semantic understanding is required.
- **Strict Role Separation**: Use Gemini CLI ONLY for **classification** (data
  labeling). Do not use it for execution or decision-making.
- **Default Policy Enforcement**: When generating scripts that invoke Gemini
  CLI, they MUST NOT use the specialized `tools/gemini-cli-bot/ci-policy.toml`.
  They should rely on the default repository policies.

## Instructions

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

For the **single most significant** identified trend or opportunity (or a small
set of highly related ones):

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

### 6. Investigation Conclusion

- Summarize your findings for the Orchestrator. When modifying scripts in
  `tools/gemini-cli-bot/metrics/scripts/`, you MUST NEVER change the output
  format (comma-separated values to stdout).
