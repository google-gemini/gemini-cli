#!/bin/bash

# sync-review.sh - Optimized Parallel PR verification
# Focuses on building for runtime and deferring others to CI status.

pr_number=$1
if [[ -z "$pr_number" ]]; then
  echo "Usage: sync-review <pr_number>"
  exit 1
fi

log_dir=".gemini/logs/review-$pr_number"
mkdir -p "$log_dir"

GEMINI_CMD=$(which gemini || echo "$HOME/.gcli/nightly/node_modules/.bin/gemini")
POLICY_PATH="$HOME/dev/main/.gemini/skills/async-pr-review/policy.toml"
[[ -f "$POLICY_PATH" ]] || POLICY_PATH=""

repo_url=$(gh repo view --json url -q .url 2>/dev/null)
pr_url="${repo_url}/pull/$pr_number"

echo "=================================================="
echo "🚀 Optimized Parallel Review for PR #$pr_number"
echo "🔗 URL: $pr_url"
echo "=================================================="

# 1. Essential Build (for npm run start / behavioral tests)
rm -f "$log_dir/build.exit"
{ { npm ci && npm run build; } > "$log_dir/build.log" 2>&1; echo $? > "$log_dir/build.exit"; } &

# 2. CI Status Check
rm -f "$log_dir/ci-status.exit"
{ gh pr checks "$pr_number" > "$log_dir/ci-checks.log" 2>&1; echo $? > "$log_dir/ci-status.exit"; } &

# 3. Gemini Code Review (Starts immediately)
rm -f "$log_dir/review.exit"
{ "$GEMINI_CMD" ${POLICY_PATH:+--policy "$POLICY_PATH"} -p "/review-frontend $pr_number" > "$log_dir/review.md" 2>&1; echo $? > "$log_dir/review.exit"; } &

# 4. Behavioral Verification (Depends on Build)
rm -f "$log_dir/test-execution.exit"
{ 
  while [ ! -f "$log_dir/build.exit" ]; do sleep 1; done
  if [ "$(cat "$log_dir/build.exit")" == "0" ]; then
    "$GEMINI_CMD" ${POLICY_PATH:+--policy "$POLICY_PATH"} -p "Analyze the diff for PR $pr_number. Physically exercise the new code in the terminal (e.g. write a temp script or use the CLI). Verify it works. Do not modify source code." > "$log_dir/test-execution.log" 2>&1; echo $? > "$log_dir/test-execution.exit"
  else
    echo "❌ Skipped verification due to build failure" > "$log_dir/test-execution.log"
    echo 1 > "$log_dir/test-execution.exit"
  fi
} &

# 5. Conditional Local Diagnostics (Only if CI fails)
rm -f "$log_dir/diagnostics.exit"
{
  while [ ! -f "$log_dir/ci-status.exit" ]; do sleep 1; done
  if [ "$(cat "$log_dir/ci-status.exit")" != "0" ]; then
    echo "🔍 CI Failed. Running local diagnostics (lint/typecheck)..." > "$log_dir/diagnostics.log"
    { npm run lint:ci && npm run typecheck; } >> "$log_dir/diagnostics.log" 2>&1
    echo $? > "$log_dir/diagnostics.exit"
  else
    echo "✅ CI Passed. Skipping local diagnostics." > "$log_dir/diagnostics.log"
    echo 0 > "$log_dir/diagnostics.exit"
  fi
} &

# Polling loop
tasks=("build" "ci-status" "review" "test-execution" "diagnostics")
log_files=("build.log" "ci-checks.log" "review.md" "test-execution.log" "diagnostics.log")

all_done=0
while [[ $all_done -eq 0 ]]; do
  clear
  echo "=================================================="
  echo "🚀 Parallel Review Status for PR #$pr_number"
  echo "=================================================="
  
  all_done=1
  for i in "${!tasks[@]}"; do
    t="${tasks[$i]}"
    if [[ -f "$log_dir/$t.exit" ]]; then
      exit_code=$(cat "$log_dir/$t.exit")
      [[ "$exit_code" == "0" ]] && echo "  ✅ $t: SUCCESS" || echo "  ❌ $t: FAILED"
    else
      echo "  ⏳ $t: RUNNING"
      all_done=0
    fi
  done
  
  echo ""
  echo "📝 Live Logs:"
  for i in "${!tasks[@]}"; do
    t="${tasks[$i]}"
    [[ ! -f "$log_dir/$t.exit" ]] && [[ -f "$log_dir/${log_files[$i]}" ]] && (echo "--- $t ---"; tail -n 3 "$log_dir/${log_files[$i]}")
  done
  
  # Special condition: We can hand off to Gemini as soon as the core review and build are done
  if [[ -f "$log_dir/build.exit" && -f "$log_dir/review.exit" ]]; then
      echo ""
      echo "💡 Core build and review are ready! Launching Gemini soon..."
  fi

  [[ $all_done -eq 0 ]] && sleep 3
done

echo ""
echo "✅ All parallel tasks complete!"
echo "=================================================="
