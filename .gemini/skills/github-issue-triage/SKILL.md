---
name: github-issue-triage
description: Analyzes and cleans up GitHub issues. DO NOT trigger this skill automatically. ONLY use when the user explicitly mentions "github-issue-triage", or explicitly asks to "triage issues", "clean up old issues", or "triage this issue".
---

# GitHub Issue Triage

This skill provides workflows for finding, analyzing, and triaging GitHub issues to maintain a clean and actionable backlog.

## Phase 1: Discovery (Optional)

If the user asks you to "triage issues" or "clean up old issues" without providing a specific issue URL, you must first find candidate issues.

Run the following script to get a list of issues:
`node scripts/find_issues.cjs <owner/repo>` (e.g., `node scripts/find_issues.cjs google-gemini/gemini-cli`)

You may optionally pass a custom search string and limit.
`node scripts/find_issues.cjs <owner/repo> "<search_string>" <limit>`

Pick the first issue from the list to triage and proceed to Phase 2. If the user provided a specific issue URL, start at Phase 2 directly.

## Phase 2: Analysis

For the target issue, you must run the analysis script to gather metadata and determine staleness/inactivity heuristics.

Run:
`node scripts/analyze_issue.cjs <issue_url> "<optional_comma_separated_maintainers>"`

Read the JSON output carefully.
- If `is_stale` is `true`, the issue has already been marked as stale and should be closed according to the rules in Phase 3.
- Take note of `inactive_over_30_days`, `inactive_over_60_days`, `is_epic`, and other boolean flags.

## Phase 3: Triage Execution

After analyzing the issue and receiving the JSON output, you MUST consult the detailed triage rules to determine the next steps.

Read the rules in [references/triage_rules.md](references/triage_rules.md) and execute the appropriate steps. You must follow the steps sequentially.

If a step instructs you to **STOP EXECUTION**, you must conclude your work on this issue and not proceed to subsequent steps. If you are triaging a batch of issues, you may move on to the next issue in the list.
