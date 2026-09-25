#!/bin/bash
pr_number="${1}"

if [[ -z "${pr_number}" ]]; then
  echo "Usage: check-async-review <pr_number>"
  exit 1
fi

base_dir="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${base_dir}" ]]; then
  echo "❌ Must be run from within a git repository."
  exit 1
fi

log_dir="${base_dir}/.gemini/tmp/async-reviews/pr-${pr_number}/logs"

if [[ ! -d "${log_dir}" ]]; then
  echo "STATUS: NOT_FOUND"
  echo "❌ No logs found for PR #${pr_number} in ${log_dir}"
  exit 0
fi

tasks=(
  "setup|setup.log"
  "pr-diff|pr-diff.diff"
  "build-and-lint|build-and-lint.log"
  "review|review.md"
  "npm-test|npm-test.log"
  "test-execution|test-execution.log"
  "final-assessment|final-assessment.md"
)

all_done=true
echo "STATUS: CHECKING"

for task_info in "${tasks[@]}"; do
  IFS="|" read -r task_name log_file <<< "${task_info}"
  
  file_path="${log_dir}/${log_file}"
  exit_file="${log_dir}/${task_name}.exit"

  if [[ -f "${exit_file}" ]]; then
    read -r exit_code < "${exit_file}" || exit_code=""
    if [[ "${exit_code}" == "0" ]]; then
      echo "✅ ${task_name}: SUCCESS"
    else
      echo "❌ ${task_name}: FAILED (exit code ${exit_code})"
      echo "   Last lines of ${file_path}:"
      tail -n 3 "${file_path}" | sed 's/^/      /' || true
    fi
  elif [[ -f "${file_path}" ]]; then
    echo "⏳ ${task_name}: RUNNING"
    all_done=false
  else
    echo "➖ ${task_name}: NOT STARTED"
    all_done=false
  fi
done

if [[ "${all_done}" == "true" ]]; then
  echo "STATUS: COMPLETE"
  echo "LOG_DIR: ${log_dir}"
else
  echo "STATUS: IN_PROGRESS"
fi
