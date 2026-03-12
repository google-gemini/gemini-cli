#!/bin/bash
# worktree-manager.sh - Manage sibling worktrees for Gemini CLI

set -e

ACTION=$1
NAME=$2
BRANCH=$3

BASE_DIR=$(pwd)
PARENT_DIR=$(dirname "$BASE_DIR")

case $ACTION in
    "add")
        if [ -z "$NAME" ] || [ -z "$BRANCH" ]; then
            echo "Error: Usage: worktree-manager.sh add <dir-name> <branch-name>"
            exit 1
        fi
        git worktree add "$PARENT_DIR/$NAME" "$BRANCH"
        echo "Success: Added worktree at $PARENT_DIR/$NAME tracking branch $BRANCH"
        ;;
    "list")
        git worktree list
        ;;
    "remove")
        if [ -z "$NAME" ]; then
            echo "Error: Usage: worktree-manager.sh remove <dir-name>"
            exit 1
        fi
        git worktree remove "$PARENT_DIR/$NAME"
        echo "Success: Removed worktree $PARENT_DIR/$NAME"
        ;;
    *)
        echo "Error: Unknown action $ACTION"
        exit 1
        ;;
esac
