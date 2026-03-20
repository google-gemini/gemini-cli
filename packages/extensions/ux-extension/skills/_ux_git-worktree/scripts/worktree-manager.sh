#!/bin/bash
# worktree-manager.sh - Manage sibling worktrees for Gemini CLI

set -e

ACTION="${1}"
NAME="${2}"
BRANCH="${3}"

BASE_DIR="$(pwd)"
PARENT_DIR="$(dirname "${BASE_DIR}")"

slugify() {
    local input="${1}"
    local slug
    slug=$(echo "${input}" | iconv -t ascii//TRANSLIT)
    slug=$(echo "${slug}" | tr -cd "[:alnum:] ")
    slug=$(echo "${slug}" | tr "[:upper:]" "[:lower:]")
    slug=$(echo "${slug}" | tr " " "-")
    slug="${slug//--/-}"
    slug=$(echo "${slug}" | cut -c 1-50)
    echo "${slug}"
}

case "${ACTION}" in
    "add")
        if [[ -z "${NAME}" ]] || [[ -z "${BRANCH}" ]]; then
            echo "Error: Usage: worktree-manager.sh add <dir-name> <branch-name>"
            exit 1
        fi
        git worktree add "${PARENT_DIR}/${NAME}" "${BRANCH}"
        echo "Success: Added worktree at ${PARENT_DIR}/${NAME} tracking branch ${BRANCH}"
        ;;
    "pr")
        if [[ -z "${NAME}" ]]; then
            echo "Error: Usage: worktree-manager.sh pr <pr-number>"
            exit 1
        fi
        PR_NUMBER="${NAME}"
        echo "Fetching PR details for #${PR_NUMBER}..."
        
        PR_DATA=$(gh pr view "${PR_NUMBER}" --json title,headRefName)
        
        PR_TITLE=$(echo "${PR_DATA}" | jq -r .title)
        PR_BRANCH=$(echo "${PR_DATA}" | jq -r .headRefName)
        
        SLUG=$(slugify "${PR_TITLE}")
        DIR_NAME="pr-${PR_NUMBER}-${SLUG}"
        
        echo "Creating semantic worktree: ${DIR_NAME}"
        git worktree add "${PARENT_DIR}/${DIR_NAME}" "${PR_BRANCH}"
        echo "Success: Added PR worktree at ${PARENT_DIR}/${DIR_NAME}"
        ;;
    "list")
        git worktree list
        ;;
    "remove")
        if [[ -z "${NAME}" ]]; then
            echo "Error: Usage: worktree-manager.sh remove <dir-name>"
            exit 1
        fi
        git worktree remove "${PARENT_DIR}/${NAME}"
        echo "Success: Removed worktree ${PARENT_DIR}/${NAME}"
        ;;
    *)
        echo "Error: Unknown action ${ACTION}"
        exit 1
        ;;
esac
