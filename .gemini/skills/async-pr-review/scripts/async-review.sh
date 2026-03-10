#!/bin/bash

notify() {
  local title="$1"
  local message="$2"
  local pr="$3"
  # Terminal escape sequence
  printf "\e]9;%s | PR #%s | %s\a" "$title" "$pr" "$message"
  # Native macOS notification
  if [[ "$(uname)" == "Darwin" ]]; then
    osascript -e "display notification \"$message\" with title \"$title\" subtitle \"PR #$pr\""
  fi
}

pr_number=$1
if [[ -z "$pr_number" ]]; then
  echo "Usage: async-review <pr_number>"
  exit 1
fi

base_dir=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$base_dir" ]]; then
  echo "❌ Must be run from within a git repository."
  exit 1
fi

# Use the repository's local .gemini/tmp directory for ephemeral worktrees and logs
pr_dir="$base_dir/.gemini/tmp/async-reviews/pr-$pr_number"
target_dir="$pr_dir/worktree"
log_dir="$pr_dir/logs"

cd "$base_dir" || exit 1

mkdir -p "$log_dir"
rm -f "$log_dir/setup.exit" "$log_dir/final-assessment.exit" "$log_dir/final-assessment.md"

echo "🧹 Cleaning up previous worktree if it exists..." | tee -a "$log_dir/setup.log"
git worktree remove -f "$target_dir" >> "$log_dir/setup.log" 2>&1 || true
git branch -D "gemini-async-pr-$pr_number" >> "$log_dir/setup.log" 2>&1 || true
git worktree prune >> "$log_dir/setup.log" 2>&1 || true

echo "📡 Fetching PR #$pr_number..." | tee -a "$log_dir/setup.log"
if ! git fetch origin -f "pull/$pr_number/head:gemini-async-pr-$pr_number" >> "$log_dir/setup.log" 2>&1; then
  echo 1 > "$log_dir/setup.exit"
  echo "❌ Fetch failed. Check $log_dir/setup.log"
  notify "Async Review Failed" "Fetch failed." "$pr_number"
  exit 1
fi

if [[ ! -d "$target_dir" ]]; then
  echo "🧹 Pruning missing worktrees..." | tee -a "$log_dir/setup.log"
  git worktree prune >> "$log_dir/setup.log" 2>&1
  echo "🌿 Creating worktree in $target_dir..." | tee -a "$log_dir/setup.log"
  if ! git worktree add "$target_dir" "gemini-async-pr-$pr_number" >> "$log_dir/setup.log" 2>&1; then
    echo 1 > "$log_dir/setup.exit"
    echo "❌ Worktree creation failed. Check $log_dir/setup.log"
    notify "Async Review Failed" "Worktree creation failed." "$pr_number"
    exit 1
  fi
else
  echo "🌿 Worktree already exists." | tee -a "$log_dir/setup.log"
fi
echo 0 > "$log_dir/setup.exit"

cd "$target_dir" || exit 1

echo "🚀 Launching background tasks. Logs saving to: $log_dir"

echo "  ↳ [1/4] Starting build and lint..."
rm -f "$log_dir/build-and-lint.exit"
{ { npm run clean && npm ci && npm run format && npm run build && npm run lint:ci && npm run typecheck; } > "$log_dir/build-and-lint.log" 2>&1; echo $? > "$log_dir/build-and-lint.exit"; } &

# Dynamically resolve gemini binary (fallback to your nightly path)
GEMINI_CMD=$(which gemini || echo "$HOME/.gcli/nightly/node_modules/.bin/gemini")

echo "  ↳ [2/4] Starting Gemini code review..."
rm -f "$log_dir/review.exit"
{ "$GEMINI_CMD" --approval-mode=yolo /review-frontend "$pr_number" > "$log_dir/review.md" 2>&1; echo $? > "$log_dir/review.exit"; } &

echo "  ↳ [3/4] Starting automated tests (waiting for build and lint)..."
rm -f "$log_dir/npm-test.exit"
{ 
  while [ ! -f "$log_dir/build-and-lint.exit" ]; do sleep 1; done
  if [ "$(cat "$log_dir/build-and-lint.exit")" == "0" ]; then
    npm run test:ci > "$log_dir/npm-test.log" 2>&1; echo $? > "$log_dir/npm-test.exit"
  else
    echo "Skipped due to build-and-lint failure" > "$log_dir/npm-test.log"
    echo 1 > "$log_dir/npm-test.exit"
  fi
} &

echo "  ↳ [4/4] Starting Gemini test execution (waiting for build and lint)..."
rm -f "$log_dir/test-execution.exit"
{ 
  while [ ! -f "$log_dir/build-and-lint.exit" ]; do sleep 1; done
  if [ "$(cat "$log_dir/build-and-lint.exit")" == "0" ]; then
    "$GEMINI_CMD" --approval-mode=yolo "Analyze the diff for PR $pr_number using 'gh pr diff $pr_number'. Instead of running the project's automated test suite (like 'npm test'), physically exercise the newly changed code in the terminal (e.g., by writing a temporary script to call the new functions, or testing the CLI command directly). Verify the feature's behavior works as expected. IMPORTANT: Do NOT modify any source code to fix errors. Just exercise the code and log the results, reporting any failures clearly. Do not ask for user confirmation." > "$log_dir/test-execution.log" 2>&1; echo $? > "$log_dir/test-execution.exit"
  else
    echo "Skipped due to build-and-lint failure" > "$log_dir/test-execution.log"
    echo 1 > "$log_dir/test-execution.exit"
  fi
} &

echo "✅ All tasks dispatched!"
echo "You can monitor progress with: tail -f $log_dir/*.log"
echo "Read your review later at: $log_dir/review.md"

# Polling loop to wait for all background tasks to finish
tasks=("build-and-lint" "review" "npm-test" "test-execution")
log_files=("build-and-lint.log" "review.md" "npm-test.log" "test-execution.log")

declare -A task_done
for t in "${tasks[@]}"; do task_done[$t]=0; done

all_done=0
while [[ $all_done -eq 0 ]]; do
  clear
  echo "=================================================="
  echo "🚀 Async PR Review Status for PR #$pr_number"
  echo "=================================================="
  echo ""
  
  all_done=1
  for i in "${!tasks[@]}"; do
    t="${tasks[$i]}"
    
    if [[ -f "$log_dir/$t.exit" ]]; then
      exit_code=$(cat "$log_dir/$t.exit")
      if [[ "$exit_code" == "0" ]]; then
        echo "  ✅ $t: SUCCESS"
      else
        echo "  ❌ $t: FAILED (exit code $exit_code)"
      fi
      task_done[$t]=1
    else
      echo "  ⏳ $t: RUNNING"
      all_done=0
    fi
  done
  
  echo ""
  echo "=================================================="
  echo "📝 Live Logs (Last 5 lines of running tasks)"
  echo "=================================================="
  
  for i in "${!tasks[@]}"; do
    t="${tasks[$i]}"
    log_file="${log_files[$i]}"
    
    if [[ ${task_done[$t]} -eq 0 ]]; then
      if [[ -f "$log_dir/$log_file" ]]; then
        echo ""
        echo "--- $t ---"
        tail -n 5 "$log_dir/$log_file"
      fi
    fi
  done
  
  if [[ $all_done -eq 0 ]]; then
    sleep 3
  fi
done

clear
echo "=================================================="
echo "🚀 Async PR Review Status for PR #$pr_number"
echo "=================================================="
echo ""
for t in "${tasks[@]}"; do
  exit_code=$(cat "$log_dir/$t.exit")
  if [[ "$exit_code" == "0" ]]; then
    echo "  ✅ $t: SUCCESS"
  else
    echo "  ❌ $t: FAILED (exit code $exit_code)"
  fi
done
echo ""

echo "⏳ Tasks complete! Synthesizing final assessment..."
if ! "$GEMINI_CMD" --approval-mode=yolo -p "Read the review at $log_dir/review.md, the automated test logs at $log_dir/npm-test.log, and the manual test execution logs at $log_dir/test-execution.log. Summarize the results, state whether the build and tests passed based on $log_dir/build-and-lint.exit and $log_dir/npm-test.exit, and give a final recommendation for PR $pr_number." > "$log_dir/final-assessment.md" 2>&1; then
  echo $? > "$log_dir/final-assessment.exit"
  echo "❌ Final assessment synthesis failed!"
  echo "Check $log_dir/final-assessment.md for details."
  notify "Async Review Failed" "Final assessment synthesis failed." "$pr_number"
  exit 1
fi

echo 0 > "$log_dir/final-assessment.exit"
echo "✅ Final assessment complete! Check $log_dir/final-assessment.md"
notify "Async Review Complete" "Review and test execution finished successfully." "$pr_number"
