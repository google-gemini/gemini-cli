#!/bin/bash
pr_number=$1
if [[ -z "$pr_number" ]]; then
  echo "Usage: async-review <pr_number>"
  exit 1
fi

base_dir="$HOME/dev/main"
pr_dir="$HOME/dev/pr-$pr_number"
target_dir="$pr_dir/worktree"
log_dir="$pr_dir/logs"

if [[ ! -d "$base_dir" ]]; then
  echo "❌ Base directory $base_dir not found."
  exit 1
fi

cd "$base_dir" || exit 1
echo "📡 Fetching PR #$pr_number..."
# Fetch the PR into a local branch to avoid detached head / namespace issues
git fetch origin -f "pull/$pr_number/head:pr-$pr_number"

if [[ ! -d "$target_dir" ]]; then
  echo "🧹 Pruning missing worktrees..."
  git worktree prune
  echo "🌿 Creating worktree in $target_dir..."
  mkdir -p "$pr_dir"
  git worktree add "$target_dir" "pr-$pr_number"
else
  echo "🌿 Worktree already exists."
fi

cd "$target_dir" || exit 1
mkdir -p "$log_dir"

echo "🚀 Launching background tasks. Logs saving to: $log_dir"

echo "  ↳ [1/3] Starting npm run preflight..."
rm -f "$log_dir/preflight.exit"
{ npm run preflight > "$log_dir/preflight.log" 2>&1; echo $? > "$log_dir/preflight.exit"; } &

GEMINI_CMD="$HOME/.gcli/nightly/node_modules/.bin/gemini"

echo "  ↳ [2/3] Starting Gemini code review..."
rm -f "$log_dir/review.exit"
{ "$GEMINI_CMD" --approval-mode=yolo /review-frontend "$pr_number" > "$log_dir/review.md" 2>&1; echo $? > "$log_dir/review.exit"; } &

echo "  ↳ [3/3] Starting Gemini test execution..."
rm -f "$log_dir/test-execution.exit"
{ "$GEMINI_CMD" --approval-mode=yolo "Analyze the diff for PR $pr_number using 'gh pr diff $pr_number'. Formulate a test plan for the changes, and then autonomously execute the test commands in the terminal to verify the feature. Do not ask for user confirmation, just run the tests and log the results." > "$log_dir/test-execution.log" 2>&1; echo $? > "$log_dir/test-execution.exit"; } &

echo "✅ All tasks dispatched!"
echo "You can monitor progress with: tail -f $log_dir/*.log"
echo "Read your review later at: $log_dir/review.md"
