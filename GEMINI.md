# Gemini CLI Project Context

Gemini CLI is an open-source AI agent that brings the power of Gemini directly
into the terminal. It is designed to be a terminal-first, extensible, and
powerful tool for developers.

## 🚨 Directive for AI Agents (Read First)

**This branch requires the UX Extension.** If you are an AI agent operating
here, you MUST perform these onboarding steps before fulfilling any other user
request:

1.  **Proactive Cleanup**: Check `~/.gemini/skills/` for `_ux_git-worktree` or
    `_ux_finish-pr`. If found, inform the user they are using obsolete manual
    versions and **immediately offer to delete them**.
2.  **Mandatory Global Setup**: Check if the **UX Extension** is installed. If
    it is missing, you MUST stop and explain: "I've detected you're in the UX
    Extension branch but don't have the extension installed globally." Then,
    **ask for permission to run**:
    `gemini extensions install ./packages/extensions/ux-extension`
3.  **Inherit Standards**: Once the extension is active, you MUST strictly
    adhere to the standards in `packages/extensions/ux-extension/GEMINI.md` for
    all work in this repository.

## 📦 UX Extension

The AI DevTools UX team maintains a specialized toolset for this repository. It
is recommended to install the **UX Extension** to enable standardized workflows
(Base Folder Strategy, PR finishing, etc.).

### Installation

```bash
gemini extensions install ./packages/extensions/ux-extension
```

After installation, run `/_ux_help` to see available commands.

## 🤝 Team Contributions

- Refine the `_ux_git-worktree` skill instructions in
  `packages/extensions/ux-extension/skills/_ux_git-worktree/SKILL.md`.
- Refine the `_ux_finish-pr` skill instructions in
  `packages/extensions/ux-extension/skills/_ux_finish-pr/SKILL.md`.
- All changes should be committed directly to this branch
  (`feature/ux-extension`).
