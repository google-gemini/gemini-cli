#!/bin/bash
pr_number=$1

if [[ -z "$pr_number" ]]; then
  echo "Usage: check-async-review <pr_number>"
  exit 1
fi

log_dir="$HOME/dev/pr-$pr_number/logs"
GEMINI_CMD="$HOME/.gcli/nightly/node_modules/.bin/gemini"

if [[ ! -d "$log_dir" ]]; then
  echo "❌ No logs found for PR #$pr_number in $log_dir"
  exit 1
fi

# Define the tasks: name|log_file
tasks=(
  "preflight|preflight.log"
  "review|review.md"
  "test-execution|test-execution.log"
)

while true; do
  clear
  echo "📊 Status for PR #$pr_number in $log_dir"
  echo "================================================="

  all_done=true

  for task_info in "${tasks[@]}"; do
    IFS="|" read -r task_name log_file <<< "$task_info"
    
    file_path="$log_dir/$log_file"
    exit_file="$log_dir/$task_name.exit"

    if [[ -f "$exit_file" ]]; then
      # Task is done
      exit_code=$(cat "$exit_file")
      if [[ "$exit_code" == "0" ]]; then
        status="✅ SUCCESS"
      else
        status="❌ FAILED (exit code $exit_code)"
      fi
    elif [[ -f "$file_path" ]]; then
      status="⏳ RUNNING"
      all_done=false
    else
      status="➖ NOT STARTED"
      all_done=false
    fi

    echo "$status - $task_name"
    
    if [[ -f "$file_path" ]]; then
      if [[ "$status" == "⏳ RUNNING" ]]; then
        # Show what it's currently doing
        echo "  Last output:"
        tail -n 3 "$file_path" | sed 's/^/    | /'
      elif [[ "$status" == *"FAILED"* ]]; then
        # Show the last lines of the error to help debug
        echo "  Error snippet:"
        tail -n 5 "$file_path" | sed 's/^/    | /'
      fi
    fi
    echo ""
  done

  if $all_done; then
    break
  fi
  
  echo "⏳ Waiting 5 seconds before checking again..."
  sleep 5
done

echo "🎉 All tasks are complete!"
echo "🤖 Asking Gemini for final PR assessment..."
echo "================================================="

"$GEMINI_CMD" "I have just completed async tasks for PR $pr_number. 

Here is the code review output:
\`\`\`markdown
$(cat "$log_dir/review.md" 2>/dev/null)
\`\`\`

Here is the test execution log:
\`\`\`
$(cat "$log_dir/test-execution.log" 2>/dev/null)
\`\`\`

Please evaluate the results. Tell me if the PR builds successfully, if it passes tests, and if you recommend I approve it based on the review. Keep your answer concise and actionable."
