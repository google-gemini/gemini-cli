#!/bin/bash
pr_number=$1

if [[ -z "$pr_number" ]]; then
  echo "Usage: check-async-review <pr_number>"
  exit 1
fi

log_dir="$HOME/dev/pr-$pr_number/logs"

if [[ ! -d "$log_dir" ]]; then
  echo "STATUS: NOT_FOUND"
  echo "❌ No logs found for PR #$pr_number in $log_dir"
  exit 0
fi

tasks=(
  "preflight|preflight.log"
  "review|review.md"
  "test-execution|test-execution.log"
)

all_done=true
echo "STATUS: CHECKING"

for task_info in "${tasks[@]}"; do
  IFS="|" read -r task_name log_file <<< "$task_info"
  
  file_path="$log_dir/$log_file"
  exit_file="$log_dir/$task_name.exit"

  if [[ -f "$exit_file" ]]; then
    exit_code=$(cat "$exit_file")
    if [[ "$exit_code" == "0" ]]; then
      echo "✅ $task_name: SUCCESS"
    else
      echo "❌ $task_name: FAILED (exit code $exit_code)"
      echo "   Last lines of $file_path:"
      tail -n 3 "$file_path" | sed 's/^/      /'
    fi
  elif [[ -f "$file_path" ]]; then
    echo "⏳ $task_name: RUNNING"
    all_done=false
  else
    echo "➖ $task_name: NOT STARTED"
    all_done=false
  fi
done

if $all_done; then
  echo "STATUS: COMPLETE"
  echo "LOG_DIR: $log_dir"
else
  echo "STATUS: IN_PROGRESS"
fi