# Phase: Policy Critique & Evaluation

## Goal

Evaluate the effectiveness of current repository policies and automation, and
suggest improvements based on empirical data.

## Context

- Current "Pulse" scripts are in `tools/gemini-cli-bot/processes/scripts/`.
  (Note: These may be empty if not yet implemented).
- Metrics and investigation results are available.
- Previous lessons learned are in `tools/gemini-cli-bot/lessons-learned.md`.

## Instructions

1.  **Review Policies**: Examine the existing automation in `.github/workflows/`
    and any scripts in `tools/gemini-cli-bot/processes/scripts/`.
2.  **Analyze Effectiveness**: Based on the metrics analysis from the
    Investigation phase, determine if the current policies are achieving their
    goals.
    - Is the "Pulse" triage effectively reducing issue/PR latency?
    - Are stale issues being closed as expected?
    - Is the "Brain" identifying the right problems?
3.  **Identify Gaps**: Where is the automation failing? Are there manual tasks
    that should be automated?
4.  **Propose Changes**: Recommend specific changes to:
    - GitHub Workflows.
    - Triage scripts.
    - Repository `CONTRIBUTING.md` or `GEMINI.md` guidelines.
5.  **Record Critique**: Append your evaluation and proposed changes to
    `tools/gemini-cli-bot/lessons-learned.md`.
