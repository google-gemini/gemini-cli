# Git Diff tool (`get_git_diff`)

This document describes the `get_git_diff` tool for the Gemini CLI.

## Description

The `get_git_diff` tool retrieves unified diffs for changes in a Git repository.
It allows viewing staged changes, unstaged changes, or all changes, helping the
AI understand the actual code modifications before proposing commits or further
changes.

### Arguments

`get_git_diff` takes the following arguments:

- `staged` (boolean, optional): If `true`, show only staged changes. If `false`,
  show only unstaged changes. If not provided, show all changes.
- `paths` (string[], optional): Array of file paths to limit the diff to
  specific files.

## How to use `get_git_diff` with the Gemini CLI

When the current directory is inside a Git repository, the tool returns:

- **Unified diff output**: Standard Git diff format showing additions,
  deletions, and context
- **File changes**: Which files were modified
- **Line-by-line changes**: What exactly changed in each file

If the current directory is **not** part of a Git repository, the tool returns a
clear error indicating that no repository was found.

Usage:

```
get_git_diff()
get_git_diff(staged=true)
get_git_diff(staged=false, paths=["src/main.ts"])
```

## `get_git_diff` examples

The tool is intended to be called by the Gemini model rather than typed directly
by the user. You can, for example, ask:

> "Show me all the changes I've made in this repository."

> "Show me the diff of staged changes so I can review them before committing."

> "What unstaged modifications do I have?"

> "Show me what changed in src/main.ts and src/utils.ts."
