# UX Extension: Extension Context

This extension provides the specialized toolset for the AI DevTools UX team.
When this extension is active, the agent must adhere to the following standards
and workflows.

## 🚨 Agent Directives

1.  **Worktree Strategy**: Always prefer the **Base Folder Strategy**. Use
    `_ux_git-worktree` to manage sibling directories for all tasks.
2.  **PR Maintenance**: Use `_ux_finish-pr` to handle the final polish of pull
    requests, ensuring all tests pass and snapshots are updated.
3.  **UI Review**: Use `_ux_designer` to audit any new Ink/React components
    against the v1.0 Design Principles (Density, Progressive Disclosure, State).
4.  **UX Writing**: Use `_ux_string-reviewer` to ensure all user-facing strings
    comply with project terminology and clarity rules.

## Mandatory Workflow

- **ALWAYS** use the `_ux_git-worktree` skill for branch management.
- **ALWAYS** use the `_ux_finish-pr` skill for pull request maintenance.
- Never use standard `git checkout -b`.
- Use `worktree-manager.sh pr <number>` for semantic PR checkouts.
- When operating in a worktree, ensure the primary `main/.git` path is included
  in your trusted directories to bypass macOS sandbox restrictions.
