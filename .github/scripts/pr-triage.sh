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
        issue="$(
            "${NODE_PATH}" "${SCRIPT_DIR}/find-linked-issue.js" --repo "${GITHUB_REPOSITORY:-}" \
                <<<"${text}" 2>/dev/null || true
        )"
    fi

    if [[ -z "${issue}" ]]; then
        issue=$({ 
            echo "${text}" | grep -ioE '(closes?|fixes?|resolves?)\s+#[0-9]+' | grep -oE '#[0-9]+' | tr -d '#'
            echo "${text}" | grep -oE '#[0-9]+' | tr -d '#'
        } | head -n 1)
        issue=${issue:-""}
    fi

    echo "${issue}"
}

# Function to process a single PR
process_pr() {
    if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
        echo "‼️ Missing $GITHUB_REPOSITORY - this must be run from GitHub Actions"
        return 1
    fi

    if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
        echo "‼️ Missing $GITHUB_OUTPUT - this must be run from GitHub Actions"
        return 1
    fi

    local PR_NUMBER=$1
    echo "🔄 Processing PR #${PR_NUMBER}"

    local PR_BODY
    if ! PR_BODY=$(gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json body -q .body 2>/dev/null); then
        echo "   ⚠️ Could not fetch PR #${PR_NUMBER} details"
        return 1
    fi

    local PR_TITLE=""
    if ! PR_TITLE=$(gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json title -q .title 2>/dev/null); then
        PR_TITLE=""
    fi

    local PR_COMMENTS=""
    if ! PR_COMMENTS=$(
        gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" \
            --json comments -q '(.comments // [] | map(.body // "") | join("\n"))' 2>/dev/null
    ); then
        PR_COMMENTS=""
    fi

    local PR_REVIEW_COMMENTS=""
    if ! PR_REVIEW_COMMENTS=$(
        gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" \
            --json reviewThreads -q '(.reviewThreads // [] | map(.comments // [] | map(.body // "") | join("\n")) | join("\n"))' 2>/dev/null
    ); then
        PR_REVIEW_COMMENTS=""
    fi

    local PR_COMMIT_MESSAGES=""
    if ! PR_COMMIT_MESSAGES=$(
        gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" \
            --json commits -q '([.commits[].messageHeadline, .commits[].messageBody] | map(select(. != null)) | join("\n"))' 2>/dev/null
    ); then
        PR_COMMIT_MESSAGES=""
    fi

    local LINKED_REFERENCE=""
    local REFERENCE_TYPE=""

    local CLOSING_ISSUES=""
    if ! CLOSING_ISSUES=$(
        gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" \
            --json closingIssuesReferences -q '(.closingIssuesReferences // [] | map((.number | tostring)) | join("\n"))' 2>/dev/null
    ); then
        CLOSING_ISSUES=""
    fi

    if [[ -n "${CLOSING_ISSUES}" ]]; then
        LINKED_REFERENCE="$(echo "${CLOSING_ISSUES}" | head -n1 | tr -d '\r')"
        if [[ -n "${LINKED_REFERENCE}" ]]; then
            REFERENCE_TYPE="github"
        fi
    fi

    if [[ -z "${LINKED_REFERENCE}" ]]; then
        local SEARCH_TEXT=""
        SEARCH_TEXT="$(printf '%s\n%s\n%s\n%s\n%s' "${PR_TITLE}" "${PR_BODY}" "${PR_COMMENTS}" "${PR_REVIEW_COMMENTS}" "${PR_COMMIT_MESSAGES}")"
        LINKED_REFERENCE="$(GITHUB_REPOSITORY="${GITHUB_REPOSITORY}" find_issue_reference "${SEARCH_TEXT}")"

        if [[ -n "${LINKED_REFERENCE}" ]]; then
            if [[ "${LINKED_REFERENCE}" =~ ^T-[0-9]+$ ]]; then
                REFERENCE_TYPE="height"
            else
                REFERENCE_TYPE="github"
            fi
        fi
    fi

    if [[ -z "${LINKED_REFERENCE}" ]]; then
        echo "⚠️  No linked issue found for PR #${PR_NUMBER}, adding status/need-issue label"
        if ! gh pr edit "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --add-label "status/need-issue" 2>/dev/null; then
            echo "   ⚠️ Failed to add label (may already exist or have permission issues)"
        fi
        if [[ -z "${PRS_NEEDING_COMMENT}" ]]; then
            PRS_NEEDING_COMMENT="${PR_NUMBER}"
        else
            PRS_NEEDING_COMMENT="${PRS_NEEDING_COMMENT},${PR_NUMBER}"
        fi
        echo "needs_comment=true" >> "${GITHUB_OUTPUT}"
    else
        if [[ "${REFERENCE_TYPE}" == "height" ]]; then
            echo "🔗 Found linked Height task ${LINKED_REFERENCE}"
        else
            echo "🔗 Found linked issue #${LINKED_REFERENCE}"
        fi

        if ! gh pr edit "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --remove-label "status/need-issue" 2>/dev/null; then
            echo "   status/need-issue label not present or could not be removed"
        fi

        if [[ "${REFERENCE_TYPE}" == "github" ]]; then
            echo "📥 Fetching labels from issue #${LINKED_REFERENCE}"
            local ISSUE_LABELS=""
            if ! ISSUE_LABELS=$(gh issue view "${LINKED_REFERENCE}" --repo "${GITHUB_REPOSITORY}" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo ""); then
                echo "   ⚠️ Could not fetch issue #${LINKED_REFERENCE} (may not exist or be in different repo)"
                ISSUE_LABELS=""
            fi

            echo "📥 Fetching labels from PR #${PR_NUMBER}"
            local PR_LABELS=""
            if ! PR_LABELS=$(gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo ""); then
                echo "   ⚠️ Could not fetch PR labels"
                PR_LABELS=""
            fi

            echo "   Issue labels: ${ISSUE_LABELS}"
            echo "   PR labels: ${PR_LABELS}"

            local ISSUE_LABEL_ARRAY PR_LABEL_ARRAY
            IFS=',' read -ra ISSUE_LABEL_ARRAY <<< "${ISSUE_LABELS}"
            IFS=',' read -ra PR_LABEL_ARRAY <<< "${PR_LABELS}"

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

            local LABELS_TO_REMOVE=""
            for label in "${PR_LABEL_ARRAY[@]}"; do
                if [[ -n "${label}" ]] && [[ "${label}" != "status/need-issue" ]]; then
                    local found=false
                    for issue_label in "${ISSUE_LABEL_ARRAY[@]}"; do
                        if [[ "${label}" == "${issue_label}" ]]; then
                            found=true
                            break
                        fi
                    done

                    if [[ "${found}" == "false" ]]; then
                        if [[ -z "${LABELS_TO_REMOVE}" ]]; then
                            LABELS_TO_REMOVE="${label}"
                        else
                            LABELS_TO_REMOVE="${LABELS_TO_REMOVE},${label}"
                        fi
                    fi
                fi
            done

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
        else
            echo "ℹ️ Skipping GitHub label sync for external reference ${LINKED_REFERENCE}"
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
