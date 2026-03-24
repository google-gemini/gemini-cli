---
name: _ux_finish-pr
description: Expert PR submission tool. Automates safe rebase, cross-platform snapshots, and mandatory full preflight validation.
---

# UX Finish PR (High-Integrity Submission)

You are a senior co-author assistant. Your goal is to ensure this PR passes CI on the FIRST attempt by enforcing project-wide rigor.

## **Mandatory Submission Protocol**

### **1. Safe Rebase & Conflict Resolution**
- **Action**: `git fetch origin main && git rebase origin/main`.
- **Constraint**: NEVER use `git merge -X ours` or `git checkout --ours`. 
- **Verification**: If conflicts occur, resolve them surgically. After rebase, run `git diff origin/main` to ensure you haven't inadvertently deleted unrelated core features.

### **2. Neutral Environment Snapshots**
- **Action**: If UI files were modified, you MUST run tests with:
  ```bash
  TERM_PROGRAM=none npm test -w @google/gemini-cli -- -u
  ```
- **Reason**: This prevents macOS-specific icons (like `MAC_TERMINAL_ICON`) from leaking into snapshots, which causes CI failure on Linux runners.

### **3. Full Validation (No Shortcuts)**
- **Action**: You MUST run the complete validation suite:
  ```bash
  npm run preflight
  ```
- **Constraint**: Passing individual tests is NOT enough. `preflight` ensures `tsc --build` passes, catching TypeScript inference bugs that unit tests miss.
- **TDD Fallback**: If `preflight` fails, you must create a local reproduction test before attempting a fix.

### **4. UI Dimension Audit**
- **Action**: If Header or Footer height changed, check `packages/cli/src/test-utils/AppRig.tsx`.
- **Reason**: Ensure `terminalHeight` is sufficient so the `Composer` prompt isn't pushed off-screen in integration tests.

### 5. Reviewer Feedback Management
- **Mandatory Comprehensive Fetching**: You must use `gh api graphql` or advanced `gh pr view` parsing to explicitly extract *inline* review comments. Basic commands often miss these nested comments.
- **Checklist Execution**: Enumerate every single comment from the reviewer and explicitly verify its resolution against the codebase.
- **Direct Engagement**: Use the GitHub API to post a direct reply to *every* addressed inline comment (e.g., "Done. Extracted to a helper.") to provide a clear audit trail.

### 6. Safe File Reversion Protocol
- **Merge-Base Awareness**: NEVER check out files blindly from the tip of `origin/main` to restore their pre-PR state.
- **Reversion Protocol**: Always find the true branch point when reverting files to strip them from a PR:
  ```bash
  BASE_SHA=$(git merge-base origin/main HEAD)
  git checkout $BASE_SHA -- <files_to_revert>
  ```
- **Diff Verification**: After reverting, run `git diff origin/main...HEAD` on the specific reverted files to ensure their diff is completely empty.

### 7. Final Submission
- **Commit Strategy**: Maintain a **Two-Tier** commit history to optimize for reviewer speed (30s vs 10m):
  1.  **Tier 1 (Base)**: A single squashed Conventional Commit (e.g., `feat(ui): ...`) containing the core feature and all *previously addressed* review cycles.
  2.  **Tier 2 (Latest)**: Separate, granular commits addressing only the **very last** round of reviewer feedback.
  - **Action**: Use `git rebase -i` or `git reset --soft` to squash all older review-fix commits into the Tier 1 base. Ensure only the commits from the current (latest) review cycle remain as separate entries.
- **Push**: `git push origin HEAD --force-with-lease`.
- **Link**: You MUST provide the full, clickable GitHub PR link (e.g., `https://github.com/google-gemini/gemini-cli/pull/23487`) as the final output of this skill. This allows the user to immediately verify the update.

**Note**: If any step fails, do NOT claim completion. Fix the issue and restart from Step 1.
