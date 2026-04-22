#!/bin/bash

notify() {
  local title="${1}"
  local message="${2}"
  local pr="${3}"
  # Terminal escape sequence
  printf "\e]9;%s | PR #%s | %s\a" "${title}" "${pr}" "${message}"
  # Native macOS notification
  os_type="$(uname || true)"
  if [[ "${os_type}" == "Darwin" ]]; then
    osascript -e "display notification \"${message}\" with title \"${title}\" subtitle \"PR #${pr}\""
  fi
}

pr_number="${1}"
if [[ -z "${pr_number}" ]]; then
  echo "Usage: async-review <pr_number>"
  exit 1
fi

base_dir="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${base_dir}" ]]; then
  echo "❌ Must be run from within a git repository."
  exit 1
fi

# Use the repository's local .gemini/tmp directory for ephemeral worktrees and logs
pr_dir="${base_dir}/.gemini/tmp/async-reviews/pr-${pr_number}"
target_dir="${pr_dir}/worktree"
log_dir="${pr_dir}/logs"

cd "${base_dir}" || exit 1

mkdir -p "${log_dir}"
rm -f "${log_dir}/setup.exit" "${log_dir}/final-assessment.exit" "${log_dir}/final-assessment.md"

echo "🧹 Cleaning up previous worktree if it exists..." | tee -a "${log_dir}/setup.log"
git worktree remove -f "${target_dir}" >> "${log_dir}/setup.log" 2>&1 || true
git branch -D "gemini-async-pr-${pr_number}" >> "${log_dir}/setup.log" 2>&1 || true
git worktree prune >> "${log_dir}/setup.log" 2>&1 || true

echo "📡 Fetching PR #${pr_number}..." | tee -a "${log_dir}/setup.log"
if ! git fetch origin -f "pull/${pr_number}/head:gemini-async-pr-${pr_number}" >> "${log_dir}/setup.log" 2>&1; then
  echo 1 > "${log_dir}/setup.exit"
  echo "❌ Fetch failed. Check ${log_dir}/setup.log"
  notify "Async Review Failed" "Fetch failed." "${pr_number}"
  exit 1
fi

if [[ ! -d "${target_dir}" ]]; then
  echo "🧹 Pruning missing worktrees..." | tee -a "${log_dir}/setup.log"
  git worktree prune >> "${log_dir}/setup.log" 2>&1
  echo "🌿 Creating worktree in ${target_dir}..." | tee -a "${log_dir}/setup.log"
  if ! git worktree add "${target_dir}" "gemini-async-pr-${pr_number}" >> "${log_dir}/setup.log" 2>&1; then
    echo 1 > "${log_dir}/setup.exit"
    echo "❌ Worktree creation failed. Check ${log_dir}/setup.log"
    notify "Async Review Failed" "Worktree creation failed." "${pr_number}"
    exit 1
  fi
else
  echo "🌿 Worktree already exists." | tee -a "${log_dir}/setup.log"
fi
echo 0 > "${log_dir}/setup.exit"

cd "${target_dir}" || exit 1

echo "🚀 Launching background tasks. Logs saving to: ${log_dir}"

echo "  ↳ [1/5] Grabbing PR diff..."
rm -f "${log_dir}/pr-diff.exit"
{ gh pr diff "${pr_number}" > "${log_dir}/pr-diff.diff" 2>&1; echo $? > "${log_dir}/pr-diff.exit"; } &

echo "  ↳ [2/5] Starting build and lint..."
rm -f "${log_dir}/build-and-lint.exit"
{ { npm run clean && npm ci && npm run format && npm run build && npm run lint:ci && npm run typecheck; } > "${log_dir}/build-and-lint.log" 2>&1; echo $? > "${log_dir}/build-and-lint.exit"; } &

# Dynamically resolve gemini binary (fallback to your nightly path)
GEMINI_CMD="$(command -v gemini || echo "${HOME}/.gcli/nightly/node_modules/.bin/gemini")"
# shellcheck disable=SC2312
POLICY_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/policy.toml"

echo "  ↳ [3/5] Starting Gemini code review..."
rm -f "${log_dir}/review.exit"
{ "${GEMINI_CMD}" --policy "${POLICY_PATH}" -p "/review-frontend ${pr_number}" > "${log_dir}/review.md" 2>&1; echo $? > "${log_dir}/review.exit"; } &

echo "  ↳ [4/5] Starting automated tests (waiting for build and lint)..."
rm -f "${log_dir}/npm-test.exit"
{ 
  while [[ ! -f "${log_dir}/build-and-lint.exit" ]]; do sleep 1; done
  read -r build_exit < "${log_dir}/build-and-lint.exit" || build_exit=""
  if [[ "${build_exit}" == "0" ]]; then
    gh pr checks "${pr_number}" > "${log_dir}/ci-checks.log" 2>&1
    ci_status=$?
    
    if [[ "${ci_status}" -eq 0 ]]; then
      echo "CI checks passed. Skipping local npm tests." > "${log_dir}/npm-test.log"
      echo 0 > "${log_dir}/npm-test.exit"
    elif [[ "${ci_status}" -eq 8 ]]; then
      echo "CI checks are still pending. Skipping local npm tests to avoid duplicate work. Please check GitHub for final results." > "${log_dir}/npm-test.log"
      echo 0 > "${log_dir}/npm-test.exit"
    else
      echo "CI checks failed. Failing checks:" > "${log_dir}/npm-test.log"
      gh pr checks "${pr_number}" --json name,bucket -q '.[] | select(.bucket=="fail") | .name' >> "${log_dir}/npm-test.log" 2>&1
      
      echo "Attempting to extract failing test files from CI logs..." >> "${log_dir}/npm-test.log"
      pr_branch="$(gh pr view "${pr_number}" --json headRefName -q '.headRefName' 2>/dev/null || true)"
      run_id="$(gh run list --branch "${pr_branch}" --workflow ci.yml --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
      
      failed_files=""
      if [[ -n "${run_id}" ]]; then
        failed_files="$(gh run view "${run_id}" --log-failed 2>/dev/null | grep -o -E '(packages/[a-zA-Z0-9_-]+|integration-tests|evals)/[a-zA-Z0-9_/-]+\.test\.ts(x)?' | sort | uniq || true)"
      fi
      
      if [[ -n "${failed_files}" ]]; then
        echo "Found failing test files from CI:" >> "${log_dir}/npm-test.log"
        for f in ${failed_files}; do echo "  - ${f}" >> "${log_dir}/npm-test.log"; done
        echo "Running ONLY failing tests locally..." >> "${log_dir}/npm-test.log"
        
        exit_code=0
        for file in ${failed_files}; do
           if [[ "${file}" == packages/* ]]; then
             ws_dir="$(echo "${file}" | cut -d'/' -f1,2)"
           else
             ws_dir="$(echo "${file}" | cut -d'/' -f1)"
           fi
           rel_file="${file#"${ws_dir}"/}"
           
           echo "--- Running ${rel_file} in workspace ${ws_dir} ---" >> "${log_dir}/npm-test.log"
           if ! npm run test:ci -w "${ws_dir}" -- "${rel_file}" >> "${log_dir}/npm-test.log" 2>&1; then
             exit_code=1
           fi
        done
        echo "${exit_code}" > "${log_dir}/npm-test.exit"
      else
        echo "Could not extract specific failing files. Skipping full local test suite as it takes too long. Please check CI logs manually." >> "${log_dir}/npm-test.log"
        echo 1 > "${log_dir}/npm-test.exit"
      fi
    fi
  else
    echo "Skipped due to build-and-lint failure" > "${log_dir}/npm-test.log"
    echo 1 > "${log_dir}/npm-test.exit"
  fi
} &

echo "  ↳ [5/5] Starting Gemini test execution (waiting for build and lint)..."
rm -f "${log_dir}/test-execution.exit"
{ 
  while [[ ! -f "${log_dir}/build-and-lint.exit" ]]; do sleep 1; done
  read -r build_exit < "${log_dir}/build-and-lint.exit" || build_exit=""
  if [[ "${build_exit}" == "0" ]]; then
    "${GEMINI_CMD}" --policy "${POLICY_PATH}" -p "Analyze the diff for PR ${pr_number} using 'gh pr diff ${pr_number}'. Instead of running the project's automated test suite (like 'npm test'), physically exercise the newly changed code in the terminal (e.g., by writing a temporary script to call the new functions, or testing the CLI command directly). Verify the feature's behavior works as expected. IMPORTANT: Do NOT modify any source code to fix errors. Just exercise the code and log the results, reporting any failures clearly. Do not ask for user confirmation." > "${log_dir}/test-execution.log" 2>&1; echo $? > "${log_dir}/test-execution.exit"
  else
    echo "Skipped due to build-and-lint failure" > "${log_dir}/test-execution.log"
    echo 1 > "${log_dir}/test-execution.exit"
  fi
} &

echo "✅ All tasks dispatched!"
echo "You can monitor progress with: tail -f ${log_dir}/*.log"
echo "Read your review later at: ${log_dir}/review.md"

# Polling loop to wait for all background tasks to finish
tasks=("pr-diff" "build-and-lint" "review" "npm-test" "test-execution")
log_files=("pr-diff.diff" "build-and-lint.log" "review.md" "npm-test.log" "test-execution.log")

declare -A task_done
for t in "${tasks[@]}"; do task_done[${t}]=0; done

all_done=0
while [[ "${all_done}" -eq 0 ]]; do
  clear
  echo "=================================================="
  echo "🚀 Async PR Review Status for PR #${pr_number}"
  echo "=================================================="
  echo ""
  
  all_done=1
  for i in "${!tasks[@]}"; do
    t="${tasks[${i}]}"
    
    if [[ -f "${log_dir}/${t}.exit" ]]; then
      read -r task_exit < "${log_dir}/${t}.exit" || task_exit=""
      if [[ "${task_exit}" == "0" ]]; then
        echo "  ✅ ${t}: SUCCESS"
      else
        echo "  ❌ ${t}: FAILED (exit code ${task_exit})"
      fi
      task_done[${t}]=1
    else
      echo "  ⏳ ${t}: RUNNING"
      all_done=0
    fi
  done
  
  echo ""
  echo "=================================================="
  echo "📝 Live Logs (Last 5 lines of running tasks)"
  echo "=================================================="
  
  for i in "${!tasks[@]}"; do
    t="${tasks[${i}]}"
    log_file="${log_files[${i}]}"
    
    if [[ "${task_done[${t}]}" -eq 0 ]]; then
      if [[ -f "${log_dir}/${log_file}" ]]; then
        echo ""
        echo "--- ${t} ---"
        tail -n 5 "${log_dir}/${log_file}"
      fi
    fi
  done
  
  if [[ "${all_done}" -eq 0 ]]; then
    sleep 3
  fi
done

clear
echo "=================================================="
echo "🚀 Async PR Review Status for PR #${pr_number}"
echo "=================================================="
echo ""
for t in "${tasks[@]}"; do
  read -r task_exit < "${log_dir}/${t}.exit" || task_exit=""
  if [[ "${task_exit}" == "0" ]]; then
    echo "  ✅ ${t}: SUCCESS"
  else
    echo "  ❌ ${t}: FAILED (exit code ${task_exit})"
  fi
done
echo ""

echo "⏳ Tasks complete! Synthesizing final assessment..."
if ! "${GEMINI_CMD}" --policy "${POLICY_PATH}" -p "Read the review at ${log_dir}/review.md, the automated test logs at ${log_dir}/npm-test.log, and the manual test execution logs at ${log_dir}/test-execution.log. Summarize the results, state whether the build and tests passed based on ${log_dir}/build-and-lint.exit and ${log_dir}/npm-test.exit, and give a final recommendation for PR ${pr_number}." > "${log_dir}/final-assessment.md" 2>&1; then
  echo $? > "${log_dir}/final-assessment.exit"
  echo "❌ Final assessment synthesis failed!"
  echo "Check ${log_dir}/final-assessment.md for details."
  notify "Async Review Failed" "Final assessment synthesis failed." "${pr_number}"
  exit 1
fi

echo 0 > "${log_dir}/final-assessment.exit"
echo "✅ Final assessment complete! Check ${log_dir}/final-assessment.md"
notify "Async Review Complete" "Review and test execution finished successfully." "${pr_number}"
