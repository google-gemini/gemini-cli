# Git Status tool (`get_git_status`)

This document describes the `get_git_status` tool for the Gemini CLI.

## Description

The `get_git_status` tool retrieves the current status of a Git repository in
your workspace. It tells the agent which files are staged, which are modified or
deleted but not staged, which are untracked, and which have merge conflicts, as
well as basic branch and remote information. This helps the AI understand the
state of your working directory before proposing commits or other Git
operations.

### Arguments

`get_git_status` takes no arguments. It always operates on the Git repository
rooted at the current working directory (as configured by the CLI).

## How to use `get_git_status` with the Gemini CLI

When the current directory is inside a Git repository, the tool returns:

- **Repository status**: Whether the working tree is clean or has changes.
- **Current branch**: The name of the active branch (if available).
- **Remote status**: Whether the current branch is ahead of or behind its remote
  tracking branch (if configured).
- **Staged files**: A list of files that have changes staged for commit.
- **Unstaged files**: A list of tracked files that have modifications (including
  deletions) not yet staged.
- **Untracked files**: A list of new files that are not yet tracked by Git.
- **Conflicted files**: A list of files with merge conflicts that require
  resolution.

If the current directory is **not** part of a Git repository, the tool returns a
clear error indicating that no repository was found.

Usage:

```
get_git_status()
```

## `get_git_status` examples

The tool is intended to be called by the Gemini model rather than typed directly
by the user. You can, for example, ask:

> “Before making any changes, use the Git status tool to show what’s currently
> modified in this repo.”
