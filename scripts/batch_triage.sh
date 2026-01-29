#!/bin/bash
# scripts/batch_triage.sh
# Usage: ./scripts/batch_triage.sh [repository]
# Example: ./scripts/batch_triage.sh google-gemini/maintainers-gemini-cli

set -e
set -o pipefail

REPO="${1:-google-gemini/gemini-cli}"
WORKFLOW="gemini-automated-issue-triage.yml"

echo "🔍 Searching for open issues in '${REPO}' that need triage (missing 'area/' label)..."

# Fetch open issues with number, title, and labels
# We fetch up to 1000 issues.
ISSUES_JSON=$(gh issue list --repo "${REPO}" --state open --limit 1000 --json number,title,labels)

# Filter issues that DO NOT have a label starting with 'area/'
TARGET_ISSUES=$(echo "${ISSUES_JSON}" | jq '[.[] | select(.labels | map(.name) | any(startswith("area/")) | not)]')

# Avoid masking return value
COUNT=$(jq '. | length' <<< "${TARGET_ISSUES}")

if [[ "${COUNT}" -eq 0 ]]; then
  echo "✅ No issues found needing triage in '${REPO}'."
  exit 0
fi

echo "🚀 Found ${COUNT} issues to triage."

# Loop through and trigger workflow
echo "${TARGET_ISSUES}" | jq -r '.[] | "\(.number)|\(.title)"' | while IFS="|" read -r number title; do
  echo "▶️  Triggering triage for #${number}: ${title}"
  
  # Trigger the workflow dispatch event
  gh workflow run "${WORKFLOW}" --repo "${REPO}" -f issue_number="${number}"
  
  # Sleep briefly to be nice to the API
  sleep 1
done

echo "🎉 All triage workflows triggered!"