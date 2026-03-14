# Fix PR Skill

This skill enables the agent to autonomously and iteratively fix a Pull Request until it is mergeable and passes all quality checks. It is designed to be run in a dedicated, non-blocking environment (like an offloaded remote session).

## Objective

The goal is to move a PR from its current state (failing tests, merge conflicts, or unaddressed comments) to a "Ready to Merge" state.

## Iterative Fix Loop

The agent must follow this loop until the PR is green and mergeable:

### 1. Synchronization & Merge Conflicts
- Fetch latest main: `git fetch origin main`.
- Attempt to merge: `git merge origin/main`.
- **If conflicts occur**: 
    - Use `git status` to identify conflicted files.
    - Resolve the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) based on the project's architectural direction.
    - `git add` and `git commit` the resolution.

### 2. CI Failure Analysis
- Check current status: `gh pr checks`.
- **If CI is failing**:
    - Download failing logs: `gh run view --log-failed`.
    - Analyze the specific error (lint, typecheck, or test failure).
    - Reproduce the failure locally (e.g., `npm run lint`, `npm test -- <path>`).
    - Apply a targeted fix.

### 3. Comment Resolution
- Fetch all comments: Use `scripts/fetch-pr-info.js` or `gh pr view --json reviews,comments`.
- Analyze:
    - **Line-level comments**: Fix the specific logic requested.
    - **Review rejections**: Address the high-level architectural concerns.
    - **General comments**: Respond or implement requested changes.
- For each fixed item, summarize the change in a commit message.

### 4. Verification & Push
- Verify the fix locally: `npm run build` and relevant tests.
- **If local verification fails**: Re-analyze and apply a new fix.
- **If local verification passes**:
    - `git add .`
    - `git commit -m "fix: address <issue/comment>"`
    - `git push origin HEAD`

### 5. Wait for CI
- Run the blocker tool: `npx tsx .gemini/skills/fix-pr/scripts/wait-for-ci.ts`.
- **If CI passes**: Move to final check.
- **If CI fails**: Repeat the loop from step 2.

## Final Check
The PR is considered "Fix Complete" when:
1. `gh pr checks` returns success for all required jobs.
2. There are no outstanding merge conflicts with `main`.
3. All critical review comments have been addressed via code changes.

## Best Practices
- **Reason about failures**: Don't just guess. Read the stack traces and log files.
- **Incremental commits**: Make small, focused commits for different fixes.
- **Verify before pushing**: Always run the build/test locally before pushing to CI to save time.
- **Be Autonomous**: In an offloaded session, you have full permission to iterate until successful.
