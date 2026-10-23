#!/bin/bash
# scripts/relabel_issues.sh
# Usage: ./scripts/relabel_issues.sh <old-label> <new-label> [repository]

set -e
set -o pipefail

OLD_LABEL="${1}"
NEW_LABEL="${2}"
REPO="${3:-google-gemini/gemini-cli}"

if [[ -z "${OLD_LABEL}" ]] || [[ -z "${NEW_LABEL}" ]]; then
  echo "Usage: $0 <old-label> <new-label> [repository]"
  echo "Example: $0 'area/models' 'area/agent'"
  exit 1
fi

echo "🔍 Searching for open issues in '${REPO}' with label '${OLD_LABEL}'..."

# Fetch issues with the old label
ISSUES=$(gh issue list --repo "${REPO}" --label "${OLD_LABEL}" --state open --limit 1000 --json number,title)

# Avoid masking return value
COUNT=$(jq '. | length' <<< "${ISSUES}")

if [[ "${COUNT}" -eq 0 ]]; then
  echo "✅ No issues found with label '${OLD_LABEL}'."
  exit 0
fi

echo "found ${COUNT} issues to relabel."

# Iterate and update
echo "${ISSUES}" | jq -r '.[] | "\(.number) \(.title)"' | while read -r number title; do
  echo "🔄 Processing #${number}: ${title}"
  echo "   - Removing: ${OLD_LABEL}"
  echo "   + Adding:   ${NEW_LABEL}"
  
  gh issue edit "${number}" --repo "${REPO}" --add-label "${NEW_LABEL}" --remove-label "${OLD_LABEL}"
  
  echo "   ✅ Done."
done

echo "🎉 All issues relabeled!"