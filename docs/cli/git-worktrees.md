# Parallel sessions with Git worktrees

When working on multiple tasks at once, you can use Git worktrees to give each
Gemini session its own copy of the codebase. Git worktrees create separate
working directories that each have their own files and branch while sharing the
same repository history. This prevents changes in one session from colliding
with another.

Learn more about [session management](./session-management.md).

> **Note:** This is a preview feature currently under active development. Your
> feedback is invaluable as we refine this feature. If you have ideas,
> suggestions, or encounter issues:
>
> - [Open an issue] on GitHub.
> - Use the **/bug** command within Gemini CLI to file an issue.

Learn more in the official Git worktree
[documentation](https://git-scm.com/docs/git-worktree).

## How to enable Git worktrees

Git worktrees are an experimental feature. You must enable them in your settings
using the `/settings` command or by manually editing your `settings.json` file.

1.  Use the `/settings` command.
2.  Search for and set **Enable Git Worktrees** to `true`.

Alternatively, add the following to your `settings.json`:

```json
{
  "experimental": {
    "worktrees": true
  }
}
```

## How to use Git worktrees

There are two ways to use Git worktrees: at startup or mid-session.

### Using the startup flag

Use the `--worktree` (`-w`) flag to create an isolated worktree and start Gemini
CLI in it.

- **Start with a specific name:** The value you pass becomes both the directory
  name (within `.gemini/worktrees/`) and the branch name.

  ```bash
  gemini --worktree feature-auth
  ```

- **Start with a random name:** If you omit the name, Gemini generates a random
  one automatically (for example, `worktree-a1b2c3d4`).

  ```bash
  gemini --worktree
  ```

### Using the slash command

If you are already in a Gemini session, you can switch to a new isolated
worktree without restarting using the `/worktree` command.

- **Switch with a specific name:**

  ```text
  /worktree feature-auth
  ```

- **Switch with a random name:**
  ```text
  /worktree
  ```

When you use `/worktree`, Gemini:

1.  **Checks your current environment:** If you are already in a worktree, it
    automatically cleans it up if there are no changes, or preserves it if there
    are.
2.  **Creates the new worktree:** Sets up a fresh copy of the codebase and a new
    branch.
3.  **Pivots the session:** Switches its working directory and reloads the
    project context (memory and tools) so you can immediately start working in
    isolation.

> **Note:** Remember to initialize your development environment in each new
> worktree according to your project's setup. Depending on your stack, this
> might include running dependency installation (`npm install`, `yarn`), setting
> up virtual environments, or following your project's standard build process.

## How to exit a worktree session

When you exit a worktree session (using `/quit` or `Ctrl+C`), Gemini
automatically determines whether to clean up or preserve the worktree based on
the presence of changes.

- **Automatic removal:** If the worktree is completely clean—meaning it has no
  uncommitted changes and no new commits have been made—Gemini automatically
  removes the worktree directory and deletes the temporary branch.
- **Safe preservation:** If Gemini detects any changes, it leaves the worktree
  intact so your work is not lost. Preservation occurs if:
  - You have **uncommitted changes** (modified files, staged changes, or new
    untracked files).
  - You have made **new commits** on the worktree branch since the session
    started.

Gemini prioritizes a fast and safe exit: it **does not display an interactive
prompt** to ask whether to keep the worktree. Instead, it ensures your work is
safely preserved by default if any modifications are detected.

## Resuming work in a worktree

If a worktree was preserved because it contained changes, Gemini displays
instructions on how to resume your work when you exit.

To resume a session in a preserved worktree, navigate to the worktree directory
and start Gemini CLI with the `--resume` flag:

```bash
cd .gemini/worktrees/feature-auth
gemini --resume latest
```

## Managing worktrees manually

For more control over worktree location and branch configuration, or to clean up
a preserved worktree, you can use Git directly:

- **Clean up a preserved worktree:**
  ```bash
  git worktree remove .gemini/worktrees/feature-auth --force
  git branch -D worktree-feature-auth
  ```
- **Create a worktree manually:**
  ```bash
  git worktree add ../project-feature-a -b feature-a
  cd ../project-feature-a && gemini
  ```

[Open an issue]: https://github.com/google-gemini/gemini-cli/issues
