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

### **5. Final Submission**
- **Squash**: Squash into a single Conventional Commit (e.g., `feat(ui): ...`).
- **Push**: `git push origin HEAD --force-with-lease`.
- **Link**: Provide the GitHub PR link.

**Note**: If any step fails, do NOT claim completion. Fix the issue and restart from Step 1.
