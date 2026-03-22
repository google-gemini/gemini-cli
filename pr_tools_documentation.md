# Gemini CLI: PR Tooling & Automation Guide

This document provides a comprehensive overview of the specialized skills,
custom commands, and extension tools available for managing Pull Requests within
the Gemini CLI project. These tools are designed to automate verification,
enforce standards, and streamline the review-to-merge lifecycle.

---

## 1. Built-in Agent Skills (`.gemini/skills/`)

These skills are available globally within the workspace and provide structural
workflows for different phases of the PR lifecycle.

### **A. `pr-creator`**

- **Purpose**: Guides the creation of high-quality PRs.
- **Workflow**:
  1.  Verifies current branch is not `main`.
  2.  Enforces a descriptive commit message following Conventional Commits.
  3.  Locates and applies the repository's `.github/PULL_REQUEST_TEMPLATE.md`.
  4.  **Mandatory**: Runs `npm run preflight` locally before pushing.
  5.  Uses `gh` CLI to create the PR from a temporary description file.
- **Key Principle**: Never push to `main`; never ignore the PR template.

### **B. `code-reviewer`**

- **Purpose**: Conducts professional, multi-dimensional code reviews.
- **Target**: Can review remote PRs (`gh pr checkout`) or local uncommitted
  changes.
- **Analysis Pillars**: Correctness, Maintainability, Readability, Efficiency,
  Security, Edge Cases, and Testability.
- **Key Principle**: Execute `npm run preflight` early to catch automated
  failures before performing human-level analysis.

### **C. `async-pr-review`**

- **Purpose**: Executes a background review job to avoid blocking the main
  session.
- **Mechanism**: Uses an "Agentic Asynchronous Pattern" where a background shell
  script invokes a headless `gemini -p` instance.
- **Workflow**: Creates an ephemeral worktree, runs preflight, and generates a
  `final-assessment.md`.
- **Key Principle**: Prevents git lock conflicts by using isolated worktrees in
  `.gemini/tmp/async-reviews/`.

### **D. `pr-address-comments`**

- **Purpose**: Helps the author systematically resolve feedback.
- **Workflow**: Uses `scripts/fetch-pr-info.js` to gather all comments and
  provides a checklist (✅ for resolved, [number] for open threads).
- **Key Principle**: The agent summarizes but waits for user guidance before
  fixing issues.

---

## 2. UX Extension Skills (`ux-extension/`)

These skills are part of the specialized UX team extension and prioritize
"finish line" polish and TUI design principles.

### **A. `_ux_finish-pr`**

- **Purpose**: Expert PR maintenance and final polish.
- **Core Principle**: **"Always maintain a clean, focused diff by resolving
  merge conflicts early and squashing into a single feature commit."**
- **Unique Features**:
  - **TDD Fallback**: If a fix fails 2-3 times, it mandates creating a local
    reproduction test case.
  - **Snapshot Review**: Mandates manual review of updated `.snap` or `.svg`
    files after running tests with `-u`.
  - **Force-Push safety**: Uses `--force-with-lease`.

### **B. `_ux_git-worktree`**

- **Purpose**: Implements the **Base Folder Strategy**.
- **Rules**: All work happens in sibling directories (e.g., `main/`,
  `feature-name/`).
- **Workflow**: Automates `git worktree add` and semantic PR checkouts (e.g.,
  `pr-123-fix-logo`).
- **Key Principle**: Prevents macOS sandbox interference by including
  `main/.git` in the trusted environment.

### **C. `_ux_designer`**

- **Purpose**: Ruthlessly enforces the **v1.0 Design Principles**.
- **Principles**:
  1.  **Signal over Noise**: Mandates collapsible components
      (`<ExpandableText>`).
  2.  **Coherent State**: Global state belongs in the "Bottom Drawer" (Footer).
  3.  **Intent Signaling**: Long-running tasks must telegaph progress via
      spinners.
  4.  **Strategic Color**: Functional use of color only; no "rainbow" text.

---

## 3. Custom Commands (`.gemini/commands/`)

These shortcuts inject specific context or trigger focused agent loops.

- **`/pr-review <PR_NUMBER>`**: Triggers the `oncall/pr-review.toml` prompt. It
  automates checkout, runs `npm run preflight`, and drafts a professional
  approval/feedback message.
- **`/review-and-fix <target>`**: Initiates the "Pickle Rick" worker loop. It
  conducts a review, identifies findings, and then spawns a manager-worker loop
  to fix every issue until validation (`npm run build`, `test`, `lint`,
  `typecheck`) passes.
- **`/frontend`**: Injects the complete source code of `packages/cli` and key
  core files, along with the `Strict Development Rules`.
- **`/prompt-suggest`**: Analyzes agent failures and suggests high-level system
  prompt improvements to prevent recurrence.

---

## 4. How to Use These Tools Correctly

To prevent the "recursive failure loop" identified in the pattern investigation,
follow these usage rules:

1.  **Start with Worktrees**: Always use `_ux_git-worktree` to check out a PR.
    This keeps your `main` branch clean and avoids sandbox issues.
2.  **Use `/frontend` for UI Tasks**: This ensures the agent is aware of the
    `Strict Development Rules` (e.g., no `any`, use `waitFor` correctly).
3.  **Run `npm run preflight` via `pr-creator`**: Never manually push a PR.
    Always call the `pr-creator` skill, as it forces the full validation suite.
4.  **Finish with `_ux_finish-pr`**: When a PR is "done," use this skill to
    squash commits, resolve final conflicts with `main`, and verify snapshots in
    a neutral environment.
5.  **Don't Bypass Hooks**: Never use `git commit --no-verify`. If pre-commit
    hooks fail, use `_ux_finish-pr` to diagnose the root cause.

---

## 5. Summary of PR verification lifecycle

| Phase            | Tool/Skill         | Command                        |
| :--------------- | :----------------- | :----------------------------- |
| **Checkout**     | `_ux_git-worktree` | `worktree-manager.sh pr <#> `  |
| **Fixing**       | `review-and-fix`   | `/review-and-fix staged`       |
| **UI Audit**     | `_ux_designer`     | `Audit <Component.tsx>`        |
| **Final Polish** | `_ux_finish-pr`    | `activate_skill _ux_finish-pr` |
| **Submission**   | `pr-creator`       | `activate_skill pr-creator`    |
