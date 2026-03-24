# PR Workflow Improvements: Lessons Learned & Skill Updates

During a recent PR review cycle, we encountered two significant workflow issues
that resulted in wasted review cycles, polluted diffs, and unnecessary churn. To
prevent these from recurring, we need to update our standard operating
procedures, specifically within the `_ux_finish-pr` skill.

## Problem 1: Blindspots in Fetching Reviewer Feedback

### The Issue

When instructed to address reviewer feedback, the agent relied on high-level PR
summaries (`gh pr view`) and top-level comments. It completely failed to fetch
or parse **inline, file-specific review comments**. As a result, critical
feedback (like removing unsafe type casts, fixing hardcoded arrays, and
reverting specific lines of code) was ignored. Furthermore, the agent did not
directly reply to the reviewer's comments to confirm resolution, leaving the
reviewer in the dark.

### The Solution for `_ux_finish-pr`

The skill must be updated to strictly mandate the retrieval and addressing of
_all_ review comments, especially inline ones.

**Proposed Skill Additions:**

- **Mandatory Comprehensive Fetching:** Require the use of `gh api graphql` or
  advanced `gh pr view` parsing to explicitly extract _inline_ review comments,
  which are often nested inside review objects and missed by basic commands.
- **Checklist Execution:** Mandate that the agent enumerates every single
  comment from the reviewer and explicitly verifies its resolution against the
  codebase.
- **Direct Engagement:** Require the agent to use the GitHub API to post a
  direct reply to _every_ addressed inline comment (e.g., "Done. Extracted to a
  helper.") to provide the reviewer with a clear audit trail.

---

## Problem 2: Git Base-State & Branch Management Errors

### The Issue

When the reviewer requested that specific configuration files be reverted to
their pre-PR state to remove them from the diff, the agent executed
`git checkout origin/main -- <files>`. Because `origin/main` had advanced with
new commits since the PR was originally branched, this action accidentally
pulled in _unrelated_ recent changes from `main`. This polluted the PR's diff,
causing it to include changes that had nothing to do with the feature, violating
the principle of atomic commits.

### The Solution for `_ux_finish-pr`

The skill must be updated to enforce strict Git merge-base practices when
reverting or referencing the original state of a PR.

**Proposed Skill Additions:**

- **Merge-Base Awareness:** Explicitly forbid blindly checking out files from
  the tip of `origin/main` when attempting to restore a file's pre-PR state.
- **Safe File Reversion Protocol:** Instruct the agent to always find the true
  branch point using `git merge-base` when reverting files to strip them from a
  PR:
  ```bash
  BASE_SHA=$(git merge-base origin/main HEAD)
  git checkout $BASE_SHA -- <files_to_revert>
  ```
- **Diff Verification:** Add a mandatory validation step where the agent runs
  `git diff origin/main...HEAD` on the specific reverted files to ensure their
  diff is completely empty, confirming they have been successfully excised from
  the PR.
