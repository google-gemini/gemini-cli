# Base Folder Strategy Architecture

## Directory Layout

```text
/project-root/          <-- Container directory (Base Folder)
├── main/               # Primary repository checkout (contains .git/)
├── feature-alpha/      # Isolated worktree for feature 'alpha'
├── bugfix-beta/        # Isolated worktree for bugfix 'beta'
└── ...
```

## Shared Metadata

All worktrees (`feature-alpha/`, `bugfix-beta/`, etc.) share the Git database
located in `main/.git`. Git worktrees use a `.git` file (not a directory) that
contains a pointer to the original metadata:
`gitdir: /path/to/main/.git/worktrees/feature-alpha`

## Sandbox Constraints (macOS)

On macOS, the Seatbelt sandbox restricts write access to the worktree directory
only. To perform Git operations (which modify `main/.git/worktrees/`), the agent
requires explicit access to the `main/.git` path.
