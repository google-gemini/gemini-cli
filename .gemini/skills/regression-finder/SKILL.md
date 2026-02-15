---
name: regression-finder
description: Identify the root cause of a regression by scanning recent PRs and commits or using automated bisecting. Use when a user reports a bug that "used to work before", "broke", "stopped working", or asks "which PR caused this regression".
---

# Regression Finder

## Overview

This skill helps you find the exact change (PR or commit) that introduced a bug. It uses a combination of metadata analysis (searching PR titles and file changes) and behavioral analysis (automated `git bisect`).

## Workflow

### 1. Reproduction Assessment
First, determine if the bug is reliably reproducible.
- Ask the user for a reproduction command or script.
- Attempt to write a minimal unit test or shell script.
- **CRITICAL**: If you cannot create a **reliable** test (e.g., due to complexity, external deps, or flakiness), **DO NOT** create an unreliable one. Skip `git bisect` and proceed to Step 2 to rely solely on metadata and code analysis.

### 2. Metadata Culprit Search (PR Focus)
Scan recent history to find the PR that likely caused the issue.
- **Prioritize finding the Pull Request (PR)**. PRs provide context (why a change was made) that commits lack.
- **Targeted File Search**: If you have high confidence in which files are involved (e.g., a UI bug in `packages/cli`), search for PRs touching those files first:
    - Use `git log -n 30 --pretty=format:"%h %s" -- <relevant_files>` to see the most recent commits to those files.
    - Look for commit messages that mention PR numbers (e.g., "Merge pull request #123" or "feat: ... (#456)").
- **Broad Search**: If the location is unknown, use `gh pr list --limit 30 --state merged` to get a general list of recent PRs and filter by title/description.
- Always try to link a suspicious commit back to its originating PR for full context.

### 3. Candidate Selection & Verification
Your goal is to identify the **PR** that caused the regression.

**Scenario A: You HAVE a reliable test**
- **Verify**: Checkout the merge commit of a candidate PR and run the test.
- **Bisect**: If candidates are unclear, use `git bisect` with the test script (see `scripts/bisect_run.sh`).

**Scenario B: You DO NOT have a reliable test**
- **Manual Analysis**: Read the code diffs of potential candidates. Look for logic changes that match the bug description.
- **Diff Check**: `git show <commit_hash>` or view the PR diff.
- **Selection**:
    - If one PR is a **Strong Match** (obvious logic error matching the bug), select it as the result.
    - If ambiguous, select the **Top 3 Candidates** based on file relevance and recency.
- **Constraint**: Do **NOT** run `git bisect` without a reliable test.

### 4. Reporting
- Present your findings:
  - **Single Strong Candidate**: If identified.
  - **Top 3 Candidates**: If the exact cause is uncertain.
- **Do NOT** automatically attempt to fix, revert, or run further verification unless explicitly asked. The user will decide the next step (e.g., revert locally, investigate further).

## Tips for Efficiency
- **Limit File Scope**: When scanning metadata, always provide file paths to `git log` to ignore unrelated changes.
- **Sanity Check**: Always verify the "Good" and "Bad" commits manually before starting a long `bisect run`.

## Common Regression Patterns
See [references/patterns.md](references/regression-patterns.md) for a guide on interpreting "breaking" changes like state synchronization issues or dependency mismatches.
