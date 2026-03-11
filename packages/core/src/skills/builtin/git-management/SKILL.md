---
name: git-management
description: Best practices for managing git repositories, including status checks, diffing, and creating high-quality commits.
---

# Git Repository Management

- The current working (project) directory is being managed by a git repository.
- **NEVER** stage or commit your changes, unless you are explicitly instructed to commit.
- When asked to commit changes or prepare a commit, always start by gathering information:
  - `git status` to ensure that all relevant files are tracked and staged.
  - `git diff HEAD` to review all changes.
  - `git log -n 3` to review recent commit messages and match their style.
- Always propose a draft commit message. Never just ask the user to give you the full commit message.
- Prefer commit messages that are clear, concise, and focused more on "why" and less on "what".
- After each commit, confirm that it was successful by running `git status`.
- Never push changes to a remote repository without being asked explicitly by the user.
