#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# 1. Get the diff and calculate lines changed
git fetch origin ${{ BASE_SHA }} --depth=1
git fetch origin ${{ HEAD_SHA }} --depth=1
DIFF=$(git diff --shortstat ${{ BASE_SHA }} ${{ HEAD_SHA }})
LINES_CHANGED=$(echo "$DIFF" | awk '{print $4 + $6}')
echo "PR #${PR_NUMBER} has ${LINES_CHANGED} lines changed."

# 2. Determine and apply size label
SIZE_LABEL=""
if (( LINES_CHANGED < 10 )); then SIZE_LABEL="size/xs"
elif (( LINES_CHANGED < 100 )); then SIZE_LABEL="size/s"
elif (( LINES_CHANGED < 500 )); then SIZE_LABEL="size/m"
elif (( LINES_CHANGED < 1000 )); then SIZE_LABEL="size/l"
else SIZE_LABEL="size/xl"
fi

echo "Applying size label: ${SIZE_LABEL}"
gh pr edit ${{ PR_NUMBER }} --add-label "${SIZE_LABEL}"

# 3. Use Gemini to determine and apply complexity label
COMPLEXITY_PROMPT="Analyze the following git diff to determine review complexity. Respond with ONLY 'review/quick' for simple changes or 'review/involved' for complex ones. Diff: $(git diff ${{ BASE_SHA }} ${{ HEAD_SHA }})"
COMPLEXITY_LABEL=$(gemini ai "${COMPLEXITY_PROMPT}")

echo "Applying complexity label: ${COMPLEXITY_LABEL}"
gh pr edit ${{ PR_NUMBER }} --add-label "${COMPLEXITY_LABEL}"

# 4. If XL, use Gemini to generate and post a comment
if [ "${SIZE_LABEL}" == "size/xl" ]; then
  echo "PR is XL. Generating comment..."
  
  # === PROMPT UPDATED HERE ===
  COMMENT_PROMPT="You are a friendly and helpful open-source project maintainer.
Write a polite and constructive comment for a pull request that is very large.
The comment should:
1. Start by thanking the author, @${PR_AUTHOR}.
2. Acknowledge their effort and the value of the contribution.
3. Gently explain that very large PRs are slow and difficult to review thoroughly.
4. Politely ask the author to break the changes into a series of smaller, logically separate pull requests.
5. End on a positive and encouraging note, assuring them you're looking forward to reviewing the smaller PRs."
  
  COMMENT_BODY=$(gemini ai "${COMMENT_PROMPT}")
  gh pr comment ${{ PR_NUMBER }} --body "${COMMENT_BODY}"
fi

echo "Triage complete."