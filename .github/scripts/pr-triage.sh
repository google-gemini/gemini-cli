#!/usr/bin/env bash
# @license
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

# Initialize a comma-separated string to hold PR numbers that need a comment
PRS_NEEDING_COMMENT=""

# Global cache for issue labels (compatible with Bash 3.2)
# Stores "|ISSUE_NUM:LABELS|" segments
ISSUE_LABELS_CACHE_FLAT="|"

# Function to get labels from an issue (with caching)
get_issue_labels() {
    local ISSUE_NUM="${1}"
    if [[ -z "${ISSUE_NUM}" || "${ISSUE_NUM}" == "null" || "${ISSUE_NUM}" == "" ]]; then
        return
    fi

    # Check cache
    case "${ISSUE_LABELS_CACHE_FLAT}" in
        *"|${ISSUE_NUM}:"*) 
            local suffix="${ISSUE_LABELS_CACHE_FLAT#*|${ISSUE_NUM}:}"
            echo "${suffix%%|*}"
            return
            ;; 
        *)
            # Cache miss, proceed to fetch
            ;;
    esac

    echo "   📥 Fetching labels from issue #${ISSUE_NUM}" >&2
    local gh_output
    if ! gh_output=$(gh issue view "${ISSUE_NUM}" --repo "${GITHUB_REPOSITORY}" --json labels -q '.labels[].name' 2>/dev/null); then
        echo "      ⚠️ Could not fetch issue #${ISSUE_NUM}" >&2
        ISSUE_LABELS_CACHE_FLAT="${ISSUE_LABELS_CACHE_FLAT}${ISSUE_NUM}:|"
        return
    fi

    local labels
    labels=$(echo "${gh_output}" | grep -x -E '(area|priority)/.*|help wanted|🔒 maintainer only' | tr '\n' ',' | sed 's/,$//' || echo "")
    
    # Save to flat cache
    ISSUE_LABELS_CACHE_FLAT="${ISSUE_LABELS_CACHE_FLAT}${ISSUE_NUM}:${labels}|"
    echo "${labels}"
}

# Function to process a single PR with pre-fetched data
process_pr_optimized() {
    local PR_NUMBER="${1}"
    local IS_DRAFT="${2}"
    local ISSUE_NUMBER="${3}"
    local CURRENT_LABELS="${4}" # Comma-separated labels

    echo "🔄 Processing PR #${PR_NUMBER}"

    local LABELS_TO_ADD=""
    local LABELS_TO_REMOVE=""

    if [[ -z "${ISSUE_NUMBER}" || "${ISSUE_NUMBER}" == "null" || "${ISSUE_NUMBER}" == "" ]]; then
        if [[ "${IS_DRAFT}" == "true" ]]; then
            echo "   📝 PR #${PR_NUMBER} is a draft and has no linked issue"
            if [[ ",${CURRENT_LABELS}," == *",status/need-issue,"* ]]; then
                echo "      ➖ Removing status/need-issue label"
                LABELS_TO_REMOVE="status/need-issue"
            fi
        else
            echo "   ⚠️  No linked issue found for PR #${PR_NUMBER}"
            if [[ ",${CURRENT_LABELS}," != *",status/need-issue,"* ]]; then
                echo "      ➕ Adding status/need-issue label"
                LABELS_TO_ADD="status/need-issue"
            fi
            
            if [[ -z "${PRS_NEEDING_COMMENT}" ]]; then
                PRS_NEEDING_COMMENT="${PR_NUMBER}"
            else
                PRS_NEEDING_COMMENT="${PRS_NEEDING_COMMENT},${PR_NUMBER}"
            fi
        fi
    else
        echo "   🔗 Found linked issue #${ISSUE_NUMBER}"

        if [[ ",${CURRENT_LABELS}," == *",status/need-issue,"* ]]; then
            echo "      ➖ Removing status/need-issue label"
            LABELS_TO_REMOVE="status/need-issue"
        fi

        local ISSUE_LABELS
        ISSUE_LABELS=$(get_issue_labels "${ISSUE_NUMBER}")

        if [[ -n "${ISSUE_LABELS}" ]]; then
            local IFS_OLD="${IFS}"
            IFS=','
            for label in ${ISSUE_LABELS}; do
                if [[ -n "${label}" ]] && [[ ",${CURRENT_LABELS}," != *",${label},"* ]]; then
                    if [[ -z "${LABELS_TO_ADD}" ]]; then
                        LABELS_TO_ADD="${label}"
                    else
                        LABELS_TO_ADD="${LABELS_TO_ADD},${label}"
                    fi
                fi
done
            IFS="${IFS_OLD}"
        fi

        if [[ -z "${LABELS_TO_ADD}" && -z "${LABELS_TO_REMOVE}" ]]; then
            echo "   ✅ Labels already synchronized"
        fi
    fi

    if [[ -n "${LABELS_TO_ADD}" || -n "${LABELS_TO_REMOVE}" ]]; then
        local EDIT_CMD=("gh" "pr" "edit" "${PR_NUMBER}" "--repo" "${GITHUB_REPOSITORY}")
        if [[ -n "${LABELS_TO_ADD}" ]]; then
            echo "      ➕ Syncing labels to add: ${LABELS_TO_ADD}"
            EDIT_CMD+=("--add-label" "${LABELS_TO_ADD}")
        fi
        if [[ -n "${LABELS_TO_REMOVE}" ]]; then
            echo "      ➖ Syncing labels to remove: ${LABELS_TO_REMOVE}"
            EDIT_CMD+=("--remove-label" "${LABELS_TO_REMOVE}")
        fi
        
        ("${EDIT_CMD[@]}" || true)
    fi
}

if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
    echo "‼️ Missing \$GITHUB_REPOSITORY - this must be run from GitHub Actions"
    exit 1
fi

if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
    echo "‼️ Missing \$GITHUB_OUTPUT - this must be run from GitHub Actions"
    exit 1
fi

JQ_EXTRACT_FIELDS='{
    number: .number,
    isDraft: .isDraft,
    issue: (.closingIssuesReferences[0].number // (.body // "" | capture("(^|[^a-zA-Z0-9])#(?<num>[0-9]+)([^a-zA-Z0-9]|$)")? | .num) // "null"),
    labels: [.labels[].name] | join(",")
}'

JQ_TSV_FORMAT='"\((.number | tostring))\t\(.isDraft)\t\((.issue // null) | tostring)\t\(.labels)"'

if [[ -n "${PR_NUMBER:-}" ]]; then
    echo "🔄 Processing single PR #${PR_NUMBER}"
    PR_DATA=$(gh pr view "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --json number,closingIssuesReferences,isDraft,body,labels 2>/dev/null) || {
        echo "❌ Failed to fetch data for PR #${PR_NUMBER}"
        exit 1
    }
    
    line=$(echo "${PR_DATA}" | jq -r "${JQ_EXTRACT_FIELDS} | ${JQ_TSV_FORMAT}")
    IFS=$'\t' read -r pr_num is_draft issue_num current_labels <<< "${line}"
    process_pr_optimized "${pr_num}" "${is_draft}" "${issue_num}" "${current_labels}"
else
    echo "📥 Getting all open pull requests..."
    PR_DATA_ALL=$(gh pr list --repo "${GITHUB_REPOSITORY}" --state open --limit 1000 --json number,closingIssuesReferences,isDraft,body,labels 2>/dev/null) || {
        echo "❌ Failed to fetch PR list"
        exit 1
    }

    PR_COUNT=$(echo "${PR_DATA_ALL}" | jq '. | length')
    echo "📊 Found ${PR_COUNT} open PRs to process"

    # Use a temporary file to avoid masking exit codes in process substitution
    tmp_file=$(mktemp)
    echo "${PR_DATA_ALL}" | jq -r ".[] | ${JQ_EXTRACT_FIELDS} | ${JQ_TSV_FORMAT}" > "${tmp_file}"
    while read -r line; do
        [[ -z "${line}" ]] && continue
        IFS=$'\t' read -r pr_num is_draft issue_num current_labels <<< "${line}"
        process_pr_optimized "${pr_num}" "${is_draft}" "${issue_num}" "${current_labels}"
    done < "${tmp_file}"
    rm -f "${tmp_file}"
fi

if [[ -z "${PRS_NEEDING_COMMENT}" ]]; then
    echo "prs_needing_comment=[]" >> "${GITHUB_OUTPUT}"
else
    echo "prs_needing_comment=[${PRS_NEEDING_COMMENT}]" >> "${GITHUB_OUTPUT}"
fi

echo "✅ PR triage completed"
