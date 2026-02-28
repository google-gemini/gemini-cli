#!/bin/bash
# -----------------------------------------------------------------------------
# Gemini CLI Headless Mode Monitoring Test Script
# -----------------------------------------------------------------------------
# Purpose:
#   Runs the Gemini CLI in headless mode across multiple models and output
#   formats, then displays the monitoring data (auth method, API stats, retries,
#   loop detection) in a readable summary.
#
# Prerequisites:
#   Authentication must already be configured (API key, OAuth, or Vertex AI).
#   Build the project first: npm run build
#
# Usage:
#   ./scripts/test_gemini.sh [--prompt "custom prompt"] [--models "model1 model2"]
#
# Options:
#   --prompt <text>   Override the default test prompt
#   --models <list>   Space-separated list of models to test (quoted)
#
# Example:
#   ./scripts/test_gemini.sh
#   ./scripts/test_gemini.sh --prompt "list files" --models "gemini-2.5-flash"
# -----------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="$REPO_ROOT/packages/cli/dist/index.js"

# Defaults
PROMPT="count how many files are in the current folder"
MODELS=(
  "gemini-2.5-pro"
  "gemini-2.5-flash"
  "gemini-3.1-pro-preview"
  "gemini-3-flash-preview"
)

# Parse args
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --prompt) PROMPT="$2"; shift ;;
    --models) IFS=' ' read -ra MODELS <<< "$2"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

# Colors
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
RESET='\033[0m'

# Check prerequisites
if [[ ! -f "$CLI" ]]; then
  echo -e "${RED}CLI not found at $CLI${RESET}"
  echo "Run 'npm run build' from the repo root first."
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo -e "${RED}jq is required but not installed.${RESET}"
  exit 1
fi

separator() {
  echo -e "${DIM}$(printf '%.0s─' {1..72})${RESET}"
}

# Header
echo ""
echo -e "${BOLD}Gemini CLI Headless Monitoring Test${RESET}"
separator
echo -e "${DIM}Prompt:${RESET}  $PROMPT"
echo -e "${DIM}Models:${RESET}  ${MODELS[*]}"
echo -e "${DIM}CLI:${RESET}     $CLI"
separator
echo ""

total_models=${#MODELS[@]}
pass_count=0
fail_count=0

for model in "${MODELS[@]}"; do
  echo -e "${BOLD}${CYAN}[$model]${RESET}"
  echo ""

  # ── stream-json run ──────────────────────────────────────────────────
  TMPFILE=$(mktemp)
  STDERRFILE=$(mktemp)
  exit_code=0

  echo -e "  ${DIM}Running with -o stream-json -d ...${RESET}"
  node "$CLI" -p "$PROMPT" -y -m "$model" -o stream-json -d \
    >"$TMPFILE" 2>"$STDERRFILE" || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    echo -e "  ${RED}FAILED${RESET} (exit code $exit_code)"
    echo ""
    if [[ -s "$STDERRFILE" ]]; then
      echo -e "  ${DIM}stderr:${RESET}"
      sed 's/^/    /' "$STDERRFILE"
      echo ""
    fi
    ((fail_count++))
    rm -f "$TMPFILE" "$STDERRFILE"
    separator
    echo ""
    continue
  fi

  ((pass_count++))

  # Parse init event
  init_line=$(jq -c 'select(.type=="init")' "$TMPFILE" 2>/dev/null | head -1)
  auth_method=$(echo "$init_line" | jq -r '.auth_method // "not set"' 2>/dev/null)
  user_tier=$(echo "$init_line" | jq -r '.user_tier // "not set"' 2>/dev/null)
  session_id=$(echo "$init_line" | jq -r '.session_id // "?"' 2>/dev/null)

  # Parse result event
  result_line=$(jq -c 'select(.type=="result")' "$TMPFILE" 2>/dev/null | tail -1)
  status=$(echo "$result_line" | jq -r '.status // "?"' 2>/dev/null)
  api_requests=$(echo "$result_line" | jq -r '.stats.api_requests // "?"' 2>/dev/null)
  api_errors=$(echo "$result_line" | jq -r '.stats.api_errors // "?"' 2>/dev/null)
  retry_count=$(echo "$result_line" | jq -r '.stats.retry_count // 0' 2>/dev/null)
  total_tokens=$(echo "$result_line" | jq -r '.stats.total_tokens // "?"' 2>/dev/null)
  input_tokens=$(echo "$result_line" | jq -r '.stats.input_tokens // "?"' 2>/dev/null)
  output_tokens=$(echo "$result_line" | jq -r '.stats.output_tokens // "?"' 2>/dev/null)
  cached=$(echo "$result_line" | jq -r '.stats.cached // "?"' 2>/dev/null)
  tool_calls=$(echo "$result_line" | jq -r '.stats.tool_calls // 0' 2>/dev/null)
  duration_ms=$(echo "$result_line" | jq -r '.stats.duration_ms // "?"' 2>/dev/null)

  # Count retries and loop events
  retry_events=$(jq -c 'select(.type=="retry")' "$TMPFILE" 2>/dev/null | wc -l | tr -d ' ')
  loop_events=$(jq -c 'select(.type=="loop_detected")' "$TMPFILE" 2>/dev/null)
  if [[ -n "$loop_events" ]]; then
    loop_count=$(echo "$loop_events" | wc -l | tr -d ' ')
    loop_type=$(echo "$loop_events" | jq -r '.loop_type // empty' 2>/dev/null | head -1)
  else
    loop_count=0
    loop_type=""
  fi

  # Extract assistant response (concatenate deltas)
  response=$(jq -r 'select(.type=="message" and .role=="assistant") | .content' "$TMPFILE" 2>/dev/null | tr -d '\n')
  # Truncate for display
  if [[ ${#response} -gt 120 ]]; then
    response="${response:0:120}..."
  fi

  # Format duration
  if [[ "$duration_ms" != "?" ]]; then
    duration_s=$(echo "scale=1; $duration_ms / 1000" | bc 2>/dev/null || echo "$duration_ms ms")
    duration_display="${duration_s}s"
  else
    duration_display="?"
  fi

  # Display
  echo -e "  ${BOLD}Auth & Session${RESET}"
  echo -e "    auth_method:  ${GREEN}$auth_method${RESET}"
  echo -e "    user_tier:    $user_tier"
  echo -e "    session_id:   ${DIM}$session_id${RESET}"
  echo ""

  echo -e "  ${BOLD}API Stats${RESET}"
  echo -e "    status:       $([ "$status" = "success" ] && echo "${GREEN}$status${RESET}" || echo "${RED}$status${RESET}")"
  echo -e "    api_requests: $api_requests"
  echo -e "    api_errors:   $([ "$api_errors" = "0" ] && echo "$api_errors" || echo "${RED}$api_errors${RESET}")"
  echo -e "    retry_count:  $([ "$retry_count" = "0" ] && echo "$retry_count" || echo "${YELLOW}$retry_count${RESET}")"
  echo -e "    duration:     $duration_display"
  echo ""

  echo -e "  ${BOLD}Tokens${RESET}"
  echo -e "    total:   $total_tokens  (in: $input_tokens, out: $output_tokens, cached: $cached)"
  echo -e "    tools:   $tool_calls calls"
  echo ""

  if [[ "$retry_events" -gt 0 ]]; then
    echo -e "  ${BOLD}${YELLOW}Retries ($retry_events)${RESET}"
    jq -r 'select(.type=="retry") | "    attempt \(.attempt)/\(.max_attempts) delay=\(.delay_ms)ms \(.error // "")"' "$TMPFILE" 2>/dev/null
    echo ""
  fi

  if [[ "$loop_count" -gt 0 ]]; then
    echo -e "  ${BOLD}${RED}Loop Detected${RESET}"
    echo -e "    type: ${loop_type:-unknown}"
    echo ""
  fi

  echo -e "  ${BOLD}Response${RESET}"
  echo -e "    ${DIM}$response${RESET}"
  echo ""

  # Show stderr if any
  stderr_content=$(cat "$STDERRFILE")
  if [[ -n "$stderr_content" ]]; then
    echo -e "  ${BOLD}Stderr${RESET}"
    echo "$stderr_content" | sed 's/^/    /'
    echo ""
  fi

  rm -f "$TMPFILE" "$STDERRFILE"
  separator
  echo ""
done

# Summary
echo -e "${BOLD}Summary${RESET}"
echo -e "  Models tested: $total_models"
echo -e "  Passed:        ${GREEN}$pass_count${RESET}"
if [[ $fail_count -gt 0 ]]; then
  echo -e "  Failed:        ${RED}$fail_count${RESET}"
else
  echo -e "  Failed:        $fail_count"
fi
echo ""
