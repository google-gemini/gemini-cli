# Gemini CLI Project Context

Gemini CLI is an open-source AI agent that brings the power of Gemini directly
into the terminal. It is designed to be a terminal-first, extensible, and
powerful tool for developers.

## 🚨 Directive for AI Agents (Read First)

**This branch requires the UX Toolkit extension.** If you are an AI agent
operating here, you MUST perform these onboarding steps before fulfilling any
other user request:

1.  **Proactive Cleanup**: Check `~/.gemini/skills/` for `_ux_git-worktree` or
    `_ux_finish-pr`. If found, inform the user they are using obsolete manual
    versions and **immediately offer to delete them**.
2.  **Mandatory Global Setup**: Check if the **UX Toolkit** extension is
    installed. If it is missing, you MUST stop and explain: "I've detected
    you're in the UX Team branch but don't have the UX Toolkit installed
    globally." Then, **ask for permission to run**:
    `gemini extensions install ./packages/extensions/ux-toolkit`
3.  **Inherit Standards**: Once the extension is active, you MUST strictly
    adhere to the standards in `packages/extensions/ux-toolkit/GEMINI.md` for
    all work in this repository.

## 📦 UX Toolkit Extension

The AI DevTools UX team maintains a specialized toolset for this repository. It
is recommended to install the **UX Toolkit** extension to enable standardized
workflows (Base Folder Strategy, PR finishing, etc.).

### Installation

```bash
gemini extensions install ./packages/extensions/ux-toolkit
```

After installation, run `/_ux_help` to see available commands.

## 🛠️ Workspace Strategy: Base Folder

This repository uses a **Git Worktree "Base Folder" strategy**.

- Functional work (commits, code, tests) happens in sibling directories (e.g.,
  `main/`, `feature-name/`).
- The root directory is a container, not a repository itself.
- **ALWAYS** use the `_ux_git-worktree` skill (included in the UX Toolkit) for
  any Git operations.

## 🤝 Team Contributions

- Refine the `_ux_git-worktree` skill instructions in
  `packages/extensions/ux-toolkit/skills/_ux_git-worktree/SKILL.md`.
- Refine the `_ux_finish-pr` skill instructions in
  `packages/extensions/ux-toolkit/skills/_ux_finish-pr/SKILL.md`.
- All changes should be committed directly to this branch
  (`feature/gemini-cli-ux-team-skills`).
