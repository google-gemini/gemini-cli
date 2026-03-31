---
name: ux-git-skill
description:
  End-to-end PR lifecycle manager. Handles the "Base Folder Strategy" for
  worktrees, safe rebasing, Neutral Environment snapshots, preflight
  validation, and Jacob's Protocol for structured commits.
---

# UX Git Workflow

## Overview
This skill manages the entire lifecycle of a feature contribution. It enforces the **Git Worktree "Base Folder" strategy** to prevent sandbox interference, and it acts as a senior co-author to ensure PRs pass CI on the FIRST attempt by enforcing project-wide rigor.

---

## Phase 1: Environment & Worktrees

### Core Rules
1.  **Enforced Hierarchy**: New tasks or branches MUST be created as sibling directories to `main/`.
2.  **No Nesting**: Branches should never be created inside existing sub-folders.
3.  **Metadata Pathing**: When operating in a worktree, always include the primary `main/.git` path in the trusted environment to bypass macOS sandbox restrictions.

### Workflows

#### 1. Creating a New Task (Branch)
When the user asks to "start a new task" or "create a branch":
1.  Identify the base directory (the parent of `main/`).
2.  Use `git worktree add ../<branch-name> -b <branch-name>` from within `main/`.
3.  **Mandatory Prep**: Run `npm install` inside the new worktree directory to ensure all dependencies are resolved.
4.  **User Handoff & Education**: Instruct the user to move into the new directory, reload their session, and test their branch using the fast build alias: `gbuild` (which maps to `npm run bundle && node bundle/gemini.js`). If they don't have this alias configured, proactively offer to set it up in their `~/.zshrc` or `~/.bash_profile`.

#### 2. Checking out a PR (Semantic Naming)
When the user asks to "check out PR #123":
1.  **NEVER** use standard `gh pr checkout` without a directory.
2.  **ALWAYS** use the automation script: `./packages/extensions/gemini-cli-ux/skills/ux-git-workflow/scripts/worktree-manager.sh pr 123`.
3.  **Mandatory Prep**: Run `npm install` inside the new worktree directory to ensure all dependencies are resolved.
4.  This script will automatically fetch the PR title and create a semantic directory name (e.g., `pr-123-fix-core-bug`).

#### 3. Committing Changes in a Worktree
If operating in a sibling worktree (e.g., `feature-xyz/`):
1.  Check for sandbox access to `../main/.git`.
2.  If access is denied, use `/directory add ../main/.git` (if interactive) or suggest the `--include-directories` flag for the next launch.

#### Task-Based Guide for Worktrees
- **List Worktrees**: Run `git worktree list`.
- **Semantic PR Checkout**: `worktree-manager.sh pr <number>`.
- **Add Manual Worktree**: `git worktree add ../<dir> <branch>`.
- **Remove Worktree**: `git worktree remove <dir>`.

---

## Phase 2: The PR Feedback Loop (High-Integrity Submission)

### **Mandatory Submission Protocol**

#### **0. PR Size Audit (500 LOC Limit)**
- **Context**: Engineering management requires all PRs to be under 500 lines of code (LOC) changed. This ensures PRs remain reviewable and atomic.
- **Action**: Before beginning the submission process, calculate the total lines changed (added + removed) relative to `origin/main`.
  - Use `git diff --shortstat origin/main...HEAD` to verify the total size.
  - Exclude snapshot updates (e.g., `*.snap` or text snapshots) from this calculation.
- **Constraint**: If the PR exceeds 500 LOC:
  1. STOP the submission process.
  2. Inform the user that the PR is too large.
  3. Offer strategies: simplify the code, cut scope, or split the changes into multiple smaller PRs. Do not proceed without explicit user override or restructuring.

#### **1. Safe Rebase & Conflict Resolution**
- **Action**: `git fetch origin main && git rebase origin/main`.
- **Constraint**: NEVER use `git merge -X ours` or `git checkout --ours`. 
- **Verification**: If conflicts occur, resolve them surgically. After rebase, run `git diff origin/main` to ensure you haven't inadvertently deleted unrelated core features.

#### **2. Neutral Environment Snapshots**
- **Action**: If UI files were modified, you MUST run tests with:
  ```bash
  TERM_PROGRAM=generic npm test -w @google/gemini-cli -- -u
  ```
- **Reason**: This prevents macOS-specific icons (like `MAC_TERMINAL_ICON`) from leaking into snapshots, which causes CI failure on Linux runners.

#### **3. Full Validation (No Shortcuts)**
- **Action**: You MUST run the complete validation and build suite:
  ```bash
  npm run build
  npm run preflight
  ```
- **Verification**: Run `npm run typecheck` explicitly if `preflight` does not include it, to ensure cross-package integrity.
- **Automated Audit**: You MUST run `/ux-review <PR_NUMBER>` (or similar audit tool) and address any issues found. This provides an automated audit of your changes to catch common mistakes before a maintainer review.
- **Constraint**: Passing individual tests is NOT enough. `preflight` ensures `tsc --build` passes, catching TypeScript inference bugs that unit tests miss. `npm run build` ensures all packages are successfully bundled for distribution.
- **TDD Fallback**: If `preflight` or `build` fails, you must create a local reproduction test before attempting a fix.

#### **4. UI Dimension Audit**
- **Action**: If Header or Footer height changed, check `packages/cli/src/test-utils/AppRig.tsx`.
- **Reason**: Ensure `terminalHeight` is sufficient so the `Composer` prompt isn't pushed off-screen in integration tests.

#### 5. Reviewer Feedback Management
- **Mandatory Comprehensive Fetching**: You must use `gh api graphql` or advanced `gh pr view` parsing to explicitly extract *inline* review comments. Basic commands often miss these nested comments.
- **Checklist Execution**: Enumerate every single comment from the reviewer and explicitly verify its resolution against the codebase.
- **Direct Engagement**: Use the GitHub API to post a direct reply to *every* addressed inline comment (e.g., "Done. Extracted to a helper.") to provide a clear audit trail.

#### 6. Safe File Reversion Protocol
- **Merge-Base Awareness**: NEVER check out files blindly from the tip of `origin/main` to restore their pre-PR state.
- **Reversion Protocol**: Always find the true branch point when reverting files to strip them from a PR:
  ```bash
  BASE_SHA=$(git merge-base origin/main HEAD)
  git checkout $BASE_SHA -- <files_to_revert>
  ```
- **Diff Verification**: After reverting, run `git diff origin/main...HEAD` on the specific reverted files to ensure their diff is completely empty.

#### 7. Diff Minimization & Refactor Isolation (Jacob's Protocol)
- **Mandatory Two-Step Process**: Never move code between files AND make logic changes in the same commit.
- **Refactor Commit**: If your task requires moving code or reorganization, create a "zero-modification" commit first. Verify that `npm run typecheck` passes but no functional logic has changed.
- **Logic Commit**: Apply logic changes or new features in a separate, follow-up commit.
- **Goal**: Ensure the diff for the refactor commit is purely about movement, and the diff for the logic commit is purely about behavior.

#### 8. Proactive Issue Linking & Project Board (Mandatory)
- **Context**: The project enforces a strict policy where PRs without a linked issue are automatically closed. Additionally, engineering management requires all issues to be tracked on the designated GitHub Project board following an Epic -> Issue -> PR hierarchy.
- **Action**: Before creating a PR, you MUST:
  1. Search existing open issues using `gh issue list --search "<keywords>"` to find a relevant issue.
  2. Ensure the issue logic matches the "Epic as parent, PRs linked to specific child Issues" structure.
  3. If an issue is found with **HIGH CONFIDENCE** that it matches the PR's intent:
     - Assign the issue to the current user (e.g., `gh issue edit <number> --add-assignee "@me"`).
     - Link the issue in the PR description (e.g., `Fixes #<number>`).
  4. If **NO** high-confidence match is found:
     - Create a new issue using `gh issue create` detailing the bug or feature.
     - **UX Epic Link**: The new issue's description MUST include a reference to the main UX Epic: `Epic: https://github.com/google-gemini/maintainers-gemini-cli/issues/1607`.
     - Assign it to the user and link it in the PR description.
  5. **Project Board Requirement**: You MUST ensure the chosen or created issue is added to the UX engineering board.
     - Add it to the project: `gh project item-add 33 --owner google-gemini --url <issue-url>` (Targeting: https://github.com/orgs/google-gemini/projects/33/views/5).
- **Constraint**: NEVER open a new PR without resolving the issue linkage and project board assignment first.

#### 9. Final Submission
- **Commit Strategy**: Maintain a structured commit history to optimize for reviewer speed (30s vs 10m):
  1.  **Tier 1 (Base Refactor)**: A single commit for all "zero-modification" refactors (file moves, reorgs).
  2.  **Tier 2 (Base Logic)**: A single squashed Conventional Commit (e.g., `feat(ui): ...`) containing the core feature logic and all *previously addressed* review cycles.
  3.  **Tier 3 (Latest Feedback)**: Separate, granular commits addressing only the **very last** round of reviewer feedback.
  - **Action**: Use `git rebase -i` or `git reset --soft` to organize commits into these tiers. Ensure refactors are ALWAYS isolated from logic.
- **Push**: `git push origin HEAD --force-with-lease`.
- **Draft PR**: If creating a new PR, you MUST create it as a draft by default (e.g., `gh pr create --draft`). It MUST remain in a draft state until all automated bot comments and frontend audits are resolved.
- **MANDATORY FINAL OUTPUT**: You MUST provide the full, clickable **GitHub PR link** (e.g., `https://github.com/google-gemini/gemini-cli/pull/23487`), the **Issue URL** (e.g., `https://github.com/google-gemini/gemini-cli/issues/12345`), AND the **npx command** to test the PR branch directly (e.g., `npx @google/gemini-cli@pr-<number>`) as the final output of this skill. This allows the user to immediately verify the update and track the associated task.

#### 10. CI Verification & Remediation Loop (The Slog)
- **Context**: Getting PRs ready for review is typically a "slog" due to CI checks failing in the GitHub environment even after passing local presubmit tests.
- **Action**: You MUST assume that CI checks have failed until you explicitly verify they have passed on the PR.
  1. Run `gh pr checks` to monitor the status of the GitHub CI pipeline.
  2. If checks fail, fetch the failure logs, diagnose the issue, apply a fix, push the update, and loop back to step 1.
  3. Before transitioning a Draft PR to Open ("Ready for Review"), you MUST ensure:
     - An automated UI/frontend audit (e.g., `/review-frontend` or `/ux-review`) has been run and all feedback addressed.
     - All comments from automated bots on the GitHub PR have been fetched, reviewed, and fully addressed.
  4. Once ALL checks have passed and the above conditions are met, ask the user if they want to mark the PR as ready for review (or use `gh pr ready` to do it for them upon explicit approval). Do not mark it ready without user verification.

#### 11. Requesting Review (Google Chat)
- **Context**: The engineering manager requests that all PRs passing checks and ready for review be posted to a specific Google Chat space so reviewers can pick them up.
- **Action**: After the PR is marked ready for review:
  1. Prepare a draft message summarizing the PR (e.g., "Hi team, PR #<number> is ready for review: <Title> - <Link>").
  2. Present the draft message to the user along with a direct link to the chat space: [Gemini CLI PR Review Requests](https://chat.google.com/room/AAQAKYbF9sM?cls=7).
  3. If the user has the Google Workspace CLI (`gws`) or relevant MCP installed, proactively offer to post the message to the space on their behalf.

**Note**: If any step fails, do NOT claim completion. Fix the issue and restart from Step 1.

---
## Resources
### scripts/worktree-manager.sh
Automated wrapper for Git Worktree operations that handles sibling pathing, semantic PR naming, and metadata links.