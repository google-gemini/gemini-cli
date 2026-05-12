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
    `IN_PROGRESS` or `SUBMITTED`), you MUST use the GitHub CLI to check its
    status and CI results.
    - **Identify Bot PRs**: Check for PRs authored by either `gemini-cli-robot`
      or the GitHub App `app/gemini-cli-bot`.
    - **Exclude Release PRs**: You MUST ignore any PRs related to the release
      process (e.g., those with "release" in the title or targeting/from
      `release/**` branches).
    - **Prioritize Fixes**: If any of your previous PRs (matching the bot's
      productivity tasks) are failing CI (‼️ status), you MUST investigate the
      failure and prioritize fixing it in this session over starting a new task.
      Do not create competing PRs; instead, update the existing one if possible
      or close it and start a fresh fix.
3.  **Update Ledger Status**:
    - If an active PR has been merged, mark it `DONE`.
    - **User Rejection (Closed but NOT Merged)**: If an active PR was closed
      without being merged, treat this as an **explicit rejection by the user**.
      You MUST mark it `FAILED` and investigate the reason (e.g., check for
      maintainer comments, review findings, or simply recognize the topic was
      undesirable).
    - **Record Failures**: For any `FAILED` task, you MUST record the specific
      reasons (CI logs, critique feedback, or user rejection) in the Decision
      Log of `tools/gemini-cli-bot/lessons-learned.md`. This signal MUST inform
      your next hypothesis to ensure you do not repeat the same mistakes or
      revisit rejected topics.

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

- **Identify Architectural Overlap:** Before optimizing any workflow, script, or
  configuration, you MUST search the repository to see if other systems act on
  the same domain or lifecycle event. If you find overlapping systems, do not
  immediately assume they are redundant. **You must verify their intent:** Do
  they contradict each other (e.g., different thresholds, duplicate messaging)?
  If they are truly conflicting, your PR should consolidate them. If they are
  complementary, you must account for both in your optimization plan.
- **Review Existing Policies**: Examine the existing automation in
  `.github/workflows/` and scripts in `tools/gemini-cli-bot/reflexes/scripts/`.
- **Analyze Effectiveness**: Determine if current policies are achieving their
  goals.

### 6. Stability & Broad Exploration (Anti-Pigeonholing)

To prevent thrashing and user confusion, you MUST adhere to these stability
rules:

- **Avoid Repeated Tweaks**: Do not continuously modify the same metric
  threshold, deadline, or rule (e.g., changing a stale issue deadline from 14
  days to 7 days, then to 10 days in consecutive runs). Once a threshold or rule
  is set, let it stabilize for at least several weeks. Rapid changes lead to
  accurate messaging (e.g., "n days remaining") on existing issues and PRs.
- **Record Baselines in Memory**: When you propose a change to a threshold,
  deadline, or metric rule, you MUST explicitly record this decision in the
  Decision Log of `tools/gemini-cli-bot/lessons-learned.md`. Treat these
  recorded numbers as stable baselines for at least several weeks. You MUST NOT
  spontaneously revisit or tweak these specific numbers during this
  stabilization period. The ONLY exceptions allowing you to bypass this
  stabilization period are: (1) direct human feedback on a PR requesting a
  different number, or (2) your metrics show the new rule caused an immediate,
  severe regression (e.g., a massive spike in incorrectly closed issues).
- **Strict Domain Rotation**: Review the Task Ledger and Decision Log. If a
  specific domain, workflow file, or script (e.g.,
  `gemini-lifecycle-manager.cjs`, "stale issue closure") appears anywhere in the
  last 5 tasks, you are STRICTLY FORBIDDEN from proposing another PR for that
  same domain or script. You MUST pick a completely different area of the
  repository to investigate (e.g., CI failures, review routing, labeling
  automation). **This is a hard mandate to prevent pigeonholing.**

### 7. Execution & Local Validation (MANDATORY)

Before finalizing any changes, you MUST:

1.  **Lint**: Run `npm run lint --fix` (if available) or `npm run lint` to
    ensure your changes adhere to repository standards. Fix all lint errors.
2.  **Build**: Run `npm run build` or `npm run bundle` to ensure your changes do
    not break the build.
3.  **Test**: Search for and run relevant tests for your changes.
4.  **Record Findings**: Use the Memory & State format provided in the common
    rules.
5.  **Action Priority**: Your ONLY goal is to propose actionable policy, reflex,
    or workflow changes that resolve the identified root cause.
