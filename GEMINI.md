# Workspace: Base Folder Strategy & Custom Skills

This branch introduces the **Keith Git Worktree** skill and enforces the **Base Folder Strategy** for repository management.

## 1. Architectural Strategy
Functional work happens in sibling directories (e.g., `main/`, `feature-name/`). The root directory acts as a container.

## 2. Setting Up Custom Skills
To ensure this agent has the necessary procedural knowledge to manage worktrees on your behalf, you must sync the custom skills to your local user directory.

### Sync Script
Run the following from the root of this worktree:
```bash
./scripts/sync-keith-skills.sh
```

### Enable the Skill
After syncing, run this command inside your interactive Gemini session:
```bash
/skills reload
```

## 3. Mandatory Workflow
- **ALWAYS** use the `keith-git-worktree` skill for branch management.
- When operating in a worktree, ensure the primary `main/.git` path is included in your trusted directories to bypass macOS sandbox restrictions.