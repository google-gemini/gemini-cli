---
name: issue-fixer
description: Proactively identify and implement surgical fixes for small-effort issues and maintain existing PRs to reduce repository backlog.
---

# Skill: Issue Fixer

## Goal

Proactively identify and implement surgical fixes for "small effort" issues and
maintain existing PRs to reduce the repository backlog.

## High-Level Expectations

1.  **Maintenance**: Prioritize driving existing `bot-fix` PRs to completion. Check for CI failures, merge conflicts, or requested changes.
2.  **Discovery**: Find open issues labeled `effort/small`. Prioritize those with clear reproduction steps. You are STRICTLY FORBIDDEN from using local commands (e.g., `npm run lint`, `npm run typecheck`, or grepping for TODOs) to find new work. You are also STRICTLY FORBIDDEN from attempting to fix issues with the internal metrics scripts or other repository tooling on your own; your ONLY source of new tasks is the GitHub issue tracker.
3.  **Autonomous Implementation**: You are responsible for the entire fix: research, code changes, and test verification.
4.  **Surgical Precision**: Changes must be minimal and strictly focused on the identified issue. Avoid "drive-by" refactoring.
5.  **Local Verification (MANDATORY TIMEOUTS)**: You MUST run `timeout 10m npm run preflight` (or `timeout 5m npm test ...`) locally and iterate on any failures before finalizing your PR. Wrapping test commands in `timeout` is **MANDATORY** to prevent hanging the CI environment if your changes introduce an infinite loop.
6.  **Expert Mentions**: Identify the domain expert for the affected files and CC them in the PR description.
7.  **Focused Contributions**: Limit your active PRs to ~10 at a time. Try to complete existing PRs before opening new ones. If a maintainer closes a PR, that may be an indication that they are rejecting the fix.

## Workflow

1.  **Inventory & Drive PRs**:
    - **ACTIVATE SKILLS**: You MUST call `activate_skill(name="memory")` and `activate_skill(name="prs")` before continuing.
    - Use the `prs` skill to list all open PRs labeled `bot-fix`.
    - If any require attention (CI failure, requested changes), focus your entire run on resolving ONE of them.
    - Do NOT start a new issue fix if an existing PR needs work.
2.  **Search for Candidates**: If no PRs need attention, search for `effort/small` issues: `gh issue list --label "effort/small" --limit 10 --json number,title,url`.
    - **CRITICAL**: `gh issue list` is your ONLY source for new tasks. Do not attempt to fix issues you discover independently in the codebase (such as broken metrics scripts) unless they correspond to a specific assigned issue from the tracker. If `gh` fails, you MUST diagnose the environment or abort the discovery phase. You are STRICTLY FORBIDDEN from using `google_web_search` to query GitHub, as it indexes closed issues. Do NOT run local discovery commands (e.g., `npm run lint`, `npm run typecheck`) to look for "easy fixes".
3.  **Select ONE Issue** and implement a fix on a new branch.
    -   **Efficient Searching**: When searching the codebase with `grep_search`, you MUST search one top-level folder at a time (e.g. `packages/core`, `packages/cli`) to avoid timeouts. Avoid searching problematic directories with large data files like `memory-tests` and `last_brain_data` unless absolutely necessary.
4.  **Verify**: You MUST run `timeout 10m npm run preflight` to verify. Wrapping test commands in `timeout` is mandatory to prevent hanging the CI environment if your changes introduce an infinite loop.
5.  **Use the `prs` Skill** to stage changes and prepare the draft PR (labels: `bot-fix`, `issue-fixer`). Ensure you write `pr-description.md` and `pr-labels.txt` to the **workspace root**.
