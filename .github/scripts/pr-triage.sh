#!/usr/bin/env bash
set -euo pipefail

# Initialize a comma-separated string to hold PR numbers that need a comment
PRS_NEEDING_COMMENT=""

# Determine script directory for invoking helper utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Attempt to locate Node.js once so we can bail out gracefully if unavailable
NODE_PATH=""
if command -v node >/dev/null 2>&1; then
    NODE_PATH="$(command -v node)"
fi

# Helper function to detect an issue reference within arbitrary text
find_issue_reference() {
    local text="$1"
    local issue=""

    if [[ -n "${NODE_PATH}" ]] && [[ -f "${SCRIPT_DIR}/find-linked-issue.js" ]]; then
        # Use the helper script to perform robust parsing. Ignore failures and
        # fall back to the legacy pattern matching below.
        issue="$("${NODE_PATH}" "${SCRIPT_DIR}/find-linked-issue.js" <<<"${text}" 2>/dev/null || true)"
    fi

    if [[ -z "${issue}" ]]; then
        issue=$(echo "${text}" | grep -oE '#[0-9]+' | head -1 | tr -d '#'
            || echo "")
    fi

    echo "${issue}"
}

# Function to process a single PR
process_pr() {
    if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
        echo "‼️ Missing \$GITHUB_REPOSITORY - this must be run from GitHub Actions"
        return 1
    fi

    if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
        echo "‼️ Missing \$GITHUB_OUTPUT - this must be run from GitHub Actions"
        return 1
    fi

    local PR_NUMBER=$1
    echo "🔄 Processing PR #${PR_NUMBER}"

    # Get PR body with error handling
    local PR_BODY
    if ! PR_BODY=$(gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json body -q .body 2>/dev/null); then
        echo "   ⚠️ Could not fetch PR #${PR_NUMBER} details"
        return 1
    fi

    # Fetch PR title for additional context when parsing issue references.
    local PR_TITLE=""
    if ! PR_TITLE=$(gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json title -q .title 2>/dev/null); then
        PR_TITLE=""
    fi

    # Look for issue references using helper script (with fallback)
    local ISSUE_NUMBER=""
    local SEARCH_TEXT="${PR_TITLE}
${PR_BODY}"
    ISSUE_NUMBER="$(find_issue_reference "${SEARCH_TEXT}")"

    if [[ -z "${ISSUE_NUMBER}" ]]; then
        echo "⚠️  No linked issue found for PR #${PR_NUMBER}, adding status/need-issue label"
        if ! gh pr edit "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --add-label "status/need-issue" 2>/dev/null; then
            echo "   ⚠️ Failed to add label (may already exist or have permission issues)"
        fi
        # Add PR number to the list
        if [[ -z "${PRS_NEEDING_COMMENT}" ]]; then
            PRS_NEEDING_COMMENT="${PR_NUMBER}"
        else
            PRS_NEEDING_COMMENT="${PRS_NEEDING_COMMENT},${PR_NUMBER}"
        fi
        echo "needs_comment=true" >> "${GITHUB_OUTPUT}"
    else
        echo "🔗 Found linked issue #${ISSUE_NUMBER}"

        # Remove status/need-issue label if present
        if ! gh pr edit "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --remove-label "status/need-issue" 2>/dev/null; then
            echo "   status/need-issue label not present or could not be removed"
        fi

        # Get issue labels
        echo "📥 Fetching labels from issue #${ISSUE_NUMBER}"
        local ISSUE_LABELS=""
        if ! ISSUE_LABELS=$(gh issue view "${ISSUE_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo ""); then
            echo "   ⚠️ Could not fetch issue #${ISSUE_NUMBER} (may not exist or be in different repo)"
            ISSUE_LABELS=""
        fi

        # Get PR labels
        echo "📥 Fetching labels from PR #${PR_NUMBER}"
        local PR_LABELS=""
        if ! PR_LABELS=$(gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo ""); then
            echo "   ⚠️ Could not fetch PR labels"
            PR_LABELS=""
        fi

        echo "   Issue labels: ${ISSUE_LABELS}"
        echo "   PR labels: ${PR_LABELS}"

        # Convert comma-separated strings to arrays
        local ISSUE_LABEL_ARRAY PR_LABEL_ARRAY
        IFS=',' read -ra ISSUE_LABEL_ARRAY <<< "${ISSUE_LABELS}"
        IFS=',' read -ra PR_LABEL_ARRAY <<< "${PR_LABELS}"

        # Find labels to add (on issue but not on PR)
        local LABELS_TO_ADD=""
        for label in "${ISSUE_LABEL_ARRAY[@]}"; do
            if [[ -n "${label}" ]] && [[ " ${PR_LABEL_ARRAY[*]} " != *" ${label} "* ]]; then
                if [[ -z "${LABELS_TO_ADD}" ]]; then
                    LABELS_TO_ADD="${label}"
                else
                    LABELS_TO_ADD="${LABELS_TO_ADD},${label}"
                fi
            fi
        done

        # Find labels to remove (on PR but not on issue)
        local LABELS_TO_REMOVE=""
        for label in "${PR_LABEL_ARRAY[@]}"; do
            if [[ -n "${label}" ]] && [[ " ${ISSUE_LABEL_ARRAY[*]} " != *" ${label} "* ]]; then
                # Don't remove status/need-issue since we already handled it
                if [[ "${label}" != "status/need-issue" ]]; then
                    if [[ -z "${LABELS_TO_REMOVE}" ]]; then
                        LABELS_TO_REMOVE="${label}"
                    else
                        LABELS_TO_REMOVE="${LABELS_TO_REMOVE},${label}"
                    fi
                fi
            fi
        done

        # Apply label changes
        if [[ -n "${LABELS_TO_ADD}" ]]; then
            echo "➕ Adding labels: ${LABELS_TO_ADD}"
            if ! gh pr edit "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --add-label "${LABELS_TO_ADD}" 2>/dev/null; then
                echo "   ⚠️ Failed to add some labels"
            fi
        fi

        if [[ -n "${LABELS_TO_REMOVE}" ]]; then
            echo "➖ Removing labels: ${LABELS_TO_REMOVE}"
            if ! gh pr edit "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --remove-label "${LABELS_TO_REMOVE}" 2>/dev/null; then
                echo "   ⚠️ Failed to remove some labels"
            fi
        fi

        if [[ -z "${LABELS_TO_ADD}" ]] && [[ -z "${LABELS_TO_REMOVE}" ]]; then
            echo "✅ Labels already synchronized"
        fi
        echo "needs_comment=false" >> "${GITHUB_OUTPUT}"
    fi
}

# If PR_NUMBER is set, process only that PR
if [[ -n "${PR_NUMBER:-}" ]]; then
    if ! process_pr "${PR_NUMBER}"; then
        echo "❌ Failed to process PR #${PR_NUMBER}"
        exit 1
    fi
else
    # Otherwise, get all open PRs and process them
    # The script logic will determine which ones need issue linking or label sync
    echo "📥 Getting all open pull requests..."
    if ! PR_NUMBERS=$(gh pr list --repo "${GITHUB_REPOSITORY}" --state open --limit 1000 --json number -q '.[].number' 2>/dev/null); then
        echo "❌ Failed to fetch PR list"
        exit 1
    fi

    if [[ -z "${PR_NUMBERS}" ]]; then
        echo "✅ No open PRs found"
    else
        # Count the number of PRs
        PR_COUNT=$(echo "${PR_NUMBERS}" | wc -w | tr -d ' ')
        echo "📊 Found ${PR_COUNT} open PRs to process"

        for pr_number in ${PR_NUMBERS}; do
            if ! process_pr "${pr_number}"; then
                echo "⚠️ Failed to process PR #${pr_number}, continuing with next PR..."
                continue
            fi
        done
    fi
fi

# Ensure output is always set, even if empty
if [[ -z "${PRS_NEEDING_COMMENT}" ]]; then
    echo "prs_needing_comment=[]" >> "${GITHUB_OUTPUT}"
else
    echo "prs_needing_comment=[${PRS_NEEDING_COMMENT}]" >> "${GITHUB_OUTPUT}"
fi

echo "✅ PR triage completed"
