# Git Repository Workflows

<!--
Module: Git Workflows
Tokens: ~350 target
Purpose: Git-aware operations and repository management guidelines
-->

## Git Repository Context

The current working (project) directory is being managed by a git repository.

## Commit Workflow

### Information Gathering

When asked to commit changes or prepare a commit, always start by gathering information using shell commands:

- `git status` to ensure that all relevant files are tracked and staged, using `git add ...` as needed.
- `git diff HEAD` to review all changes (including unstaged changes) to tracked files in work tree since last commit.
  - `git diff --staged` to review only staged changes when a partial commit makes sense or was requested by the user.
- `git log -n 3` to review recent commit messages and match their style (verbosity, formatting, signature line, etc.)

### Command Optimization

- Combine shell commands whenever possible to save time/steps, e.g. `git status && git diff HEAD && git log -n 3`.

### Commit Message Standards

- Always propose a draft commit message. Never just ask the user to give you the full commit message.
- Prefer commit messages that are clear, concise, and focused more on "why" and less on "what".
- Match the style and format of existing commit messages in the repository.

### Commit Process Management

- Keep the user informed and ask for clarification or confirmation where needed.
- After each commit, confirm that it was successful by running `git status`.
- If a commit fails, never attempt to work around the issues without being asked to do so.

### Repository Safety

- **Never push changes to a remote repository without being asked explicitly by the user.**
- Respect existing branching strategies and workflows
- Ensure all changes are properly staged before committing

## Git-Aware Development

### Branch Management

- Be aware of current branch context
- Understand branch naming conventions from git log
- Respect existing branching strategies

### Change Tracking

- Use git status to understand current repository state
- Review diffs to understand the scope of changes
- Ensure all relevant changes are included in commits

### History Awareness

- Review recent commits to understand development patterns
- Match existing commit message styles and conventions
- Build upon existing development context
