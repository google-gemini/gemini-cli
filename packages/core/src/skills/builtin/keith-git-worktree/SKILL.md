---
name: keith-git-worktree
description: Manage Git Worktrees according to the "Base Folder Strategy". Use when the user wants to create branches, switch tasks, or manage parallel development environments in the Gemini CLI project.
---

# Keith Git Worktree

## Overview

This skill manages the **Git Worktree "Base Folder" strategy**, ensuring that all functional work occurs in sibling sub-directories (e.g., `/main`, `/feature-name`) rather than nested branches. It prevents sandbox interference and enables parallel development.

## Core Rules

1.  **Enforced Hierarchy**: New tasks or branches MUST be created as sibling directories to `main/`.
2.  **No Nesting**: Branches should never be created inside existing sub-folders.
3.  **Metadata Pathing**: When operating in a worktree, always include the primary `main/.git` path in the trusted environment to bypass macOS sandbox restrictions.

## Workflows

### 1. Creating a New Task (Branch)

When the user asks to "start a new task" or "create a branch":
1.  Identify the base directory (the parent of `main/`).
2.  Use `git worktree add ../<branch-name> -b <branch-name>` from within `main/`.
3.  Instruct the user to move into the new directory and reload their session.

### 2. Committing Changes in a Worktree

If operating in a sibling worktree (e.g., `feature-xyz/`):
1.  Check for sandbox access to `../main/.git`.
2.  If access is denied, use `/directory add ../main/.git` (if interactive) or suggest the `--include-directories` flag for the next launch.

## Task-Based Guide

### Managing Worktrees
- **List Worktrees**: Run `git worktree list`.
- **Add Worktree**: `git worktree add ../<dir> <branch>`.
- **Remove Worktree**: `git worktree remove <dir>`.

### Sandbox Navigation
- **Architecture Reference**: See [architecture.md](references/architecture.md) for details on the folder hierarchy.
- **Automation Script**: Use [worktree-manager.sh](scripts/worktree-manager.sh) for safe, deterministic operations.

## Resources

### references/architecture.md
Technical details of the "Base Folder" standard.

### scripts/worktree-manager.sh
Automated wrapper for Git Worktree operations that handles the sibling pathing and metadata links.
