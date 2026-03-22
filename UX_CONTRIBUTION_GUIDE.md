# UX Contribution Guide: Gemini CLI

This guide provides a specialized workflow for the AI DevTools UX team and AI
agents contributing to the Gemini CLI. It supplements the project's standard
[CONTRIBUTING.md](./CONTRIBUTING.md) by introducing high-integrity automation
and TUI-specific validation protocols.

---

## 1. Relationship to the Main Contributors Guide

All contributors must first adhere to the foundational rules in the root
[CONTRIBUTING.md](./CONTRIBUTING.md) (CLA, Issue linking, Conventional Commits).

The **UX Contribution Guide** extends these rules with specialized tools
designed to solve the "local vs. remote" discrepancy pattern and ensure that
complex TUI layouts and cross-platform terminal icons are verified correctly
before submission.

---

## 2. The UX "Gold Standard" Submission Protocol

To prevent the common "recursive failure loop" identified in the pattern
investigation, all UX-related PRs must be submitted using the
**`/_ux_finish-pr`** command.

### **Why this protocol is mandatory:**

- **Standard `preflight` is not enough**: The main `CONTRIBUTING.md` mandates
  `npm run preflight`. This guide mandates it be run via the agentic tool to
  ensure `TERM_PROGRAM=none` is used for snapshots, preventing macOS-specific
  icon leaks.
- **Safe State Management**: It enforces the **Base Folder Strategy** (via
  `_ux_git-worktree`) to prevent sandbox interference.
- **Safe Rebase**: It forbids destructive `ours` merge strategies that delete
  core features.

---

## 3. Workflow for Agents (Step-by-Step)

AI Agents working on UX tasks must follow this lifecycle strictly:

| Phase       | Tool/Command         | Requirement                                                                         |
| :---------- | :------------------- | :---------------------------------------------------------------------------------- |
| **Start**   | `_ux_git-worktree`   | Use `worktree-manager.sh pr <NUMBER>`. Never work in `main`.                        |
| **Develop** | `/frontend`          | Injects the `Strict Development Rules` and full CLI context.                        |
| **Iterate** | `tsc --build`        | Must pass locally for the affected package before any commit.                       |
| **Submit**  | **`/_ux_finish-pr`** | **Mandatory One-Command Submission.** Covers rebase, snapshots, and full preflight. |

---

## 4. User Steering Guide

To maintain high integrity, users should steer agents using these UX-specific
triggers:

- **To start a task**: "Use `_ux_git-worktree` to check out PR #123."
- **To address feedback**: "Use `pr-address-comments` to summarize Jacob's
  review."
- **To audit UI**: "Use `_ux_designer` to audit the new component against v1.0
  principles."
- **To submit**: **`/_ux_finish-pr`**. (Do not accept "I've pushed the changes"
  until this command completes).

---

## 5. Summary of Specialized UX Tools

These tools are not covered in the main `CONTRIBUTING.md` but are essential for
UX integrity:

| Command                 | Skill              | Purpose                                                           |
| :---------------------- | :----------------- | :---------------------------------------------------------------- |
| **`/_ux_finish-pr`**    | `_ux_finish-pr`    | **Submission Tool.** Safe rebase + Full Preflight + Snapshot fix. |
| **`/_ux_git-worktree`** | `_ux_git-worktree` | Implements the **Base Folder Strategy** for clean environments.   |
| **`/_ux_designer`**     | `_ux_designer`     | Enforces Signal over Noise and Coherent State principles.         |
| **`/review-and-fix`**   | `Pickle Rick`      | Automated remediation of complex monorepo build failures.         |

---

## 6. Conclusion

By following this UX-specific extension of the contribution process, we ensure
that the Gemini CLI remains visually stable, responsive, and cross-platform
compatible. **If the `/_ux_finish-pr` command fails, the PR is not ready for
submission.**
