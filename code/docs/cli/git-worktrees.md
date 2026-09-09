# Git Worktrees (experimental)

When working on multiple tasks at once, you can use Git worktrees to give each
Gemini session its own copy of the codebase. Git worktrees create separate
working directories that each have their own files and branch while sharing the
same repository history. This prevents changes in one session from colliding
with another.

Learn more about [session management](./session-management.md).

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development. Your
> feedback is invaluable as we refine this feature. If you have ideas,
> suggestions, or encounter issues:
>
> - [Open an issue](https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml) on GitHub.
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

Use the `--worktree` (`-w`) flag to create an isolated worktree and start Gemini
CLI in it.

- **Start with a specific name:** The value you pass becomes both the directory
  name (within `.gemini/worktrees/`) and the branch name.

  ```bash
  gemini --worktree feature-search
  ```

- **Start with a random name:** If you omit the name, Gemini generates a random
  one automatically (for example, `worktree-a1b2c3d4`).

  ```bash
  gemini --worktree
  ```

<!-- prettier-ignore -->
> [!NOTE]
> Remember to initialize your development environment in each new
> worktree according to your project's setup. Depending on your stack, this
> might include running dependency installation (`npm install`, `yarn`), setting
> up virtual environments, or following your project's standard build process.

## How to exit a Git worktree session

When you exit a worktree session (using `/quit` or `Ctrl+C`), Gemini leaves the
worktree intact so your work is not lost. This includes your uncommitted changes
(modified files, staged changes, or untracked files) and any new commits you
have made.

Gemini prioritizes a fast and safe exit: it **does not automatically delete**
your worktree or branch. You are responsible for cleaning up your worktrees
manually once you are finished with them.

When you exit, Gemini displays instructions on how to resume your work or how to
manually remove the worktree if you no longer need it.

## Resuming work in a Git worktree

To resume a session in a worktree, navigate to the worktree directory and start
Gemini CLI with the `--resume` flag and the session ID:

```bash
cd .gemini/worktrees/feature-search
gemini --resume <session_id>
```

## Managing Git worktrees manually

For more control over worktree location and branch configuration, or to clean up
a preserved worktree, you can use Git directly:

- **Clean up a preserved Git worktree:**
  ```bash
  git worktree remove .gemini/worktrees/feature-search --force
  git branch -D worktree-feature-search
  ```
- **Create a Git worktree manually:**
  ```bash
  git worktree add ../project-feature-search -b feature-search
  cd ../project-feature-search && gemini
  ```

[Open an issue]: https://github.com/google-gemini/gemini-cli/issues
