# Workspace: Base Folder Strategy & Custom Skills

This branch introduces the **Git Worktree** skill and enforces the **Base Folder Strategy** for repository management. It is maintained by the AI DevTools UX team.

## 🚨 Directive for AI Agents (Read First)
**If you are an AI agent operating in this branch, your first task is to ensure the `git-worktree` skill is active.**
1. Check if `~/.gemini/skills/git-worktree/` exists.
2. If it is missing, immediately execute `./scripts/sync-skills.sh`.
3. Prompt the user to run `/skills reload` if you are in an interactive session.

## 🤝 Team Contributions
This is a **Draft PR branch**. Your team is encouraged to:
- Refine the `git-worktree` skill instructions in `packages/core/src/skills/builtin/git-worktree/SKILL.md`.
- Improve the automation in `scripts/worktree-manager.sh`.
- All changes should be committed directly to this branch (`feature/gemini-cli-ux-team-skills`).

## 1. Architectural Strategy
Functional work happens in sibling directories (e.g., `main/`, `feature-name/`). The root directory acts as a container.

## 2. Setting Up Custom Skills
To ensure this agent has the necessary procedural knowledge to manage worktrees on your behalf, you must sync the custom skills to your local user directory.

### Sync Script
Run the following from the root of this worktree:
```bash
./scripts/sync-skills.sh
```

## 3. Mandatory Workflow
- **ALWAYS** use the `git-worktree` skill for branch management.
- Never use standard `git checkout -b`.
- Use `worktree-manager.sh pr <number>` for semantic PR checkouts.
- When operating in a worktree, ensure the primary `main/.git` path is included in your trusted directories to bypass macOS sandbox restrictions.