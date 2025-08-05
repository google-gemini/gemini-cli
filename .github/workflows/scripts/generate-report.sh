#!/bin/bash

# --- Date Calculation ---
START_DATE=$(date -d "last Friday" +%Y-%m-%d)
END_DATE=$(date -d "last Thursday" +%Y-%m-%d)
DATE_RANGE="${START_DATE}..${END_DATE}"

# --- Report Generation ---
# Print a header row for the CSV
echo "Date Range,Username,PRs Submitted,Issues Closed"

# Get a list of all repository contributors, filter out bots, and extract the login name
USERNAMES=$(gh repo contributors --repo "${GITHUB_REPO}" --json "login" --jq '.[] | select(.login | contains("[bot]") | not) | .login')

# Loop through each user and generate a data row
for USER in $USERNAMES; do
  # Get metrics using the GitHub CLI
  PRS_SUBMITTED=$(gh pr list --author "${USER}" --search "created:${DATE_RANGE}" --repo "${GITHUB_REPO}" --json number --jq 'length')
  ISSUES_CLOSED=$(gh issue list --search 'closer:"${USER}" closed:${DATE_RANGE}' --repo "${GITHUB_REPO}" --json number --jq 'length')

  # Print the data as a CSV row
  echo "${START_DATE} to ${END_DATE},${USER},${PRS_SUBMITTED},${ISSUES_CLOSED}"
done
