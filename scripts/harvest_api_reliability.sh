#!/bin/bash

# Gemini API Reliability Harvester
# -------------------------------
# This script gathers data about 500 API errors encountered during evaluation runs
# (eval.yml) from GitHub Actions. It is used to analyze developer friction caused 
# by transient API failures.
#
# Usage:
#   ./scripts/harvest_api_reliability.sh [SINCE] [LIMIT] [BRANCH]
#
# Examples:
#   ./scripts/harvest_api_reliability.sh           # Last 7 days, all branches
#   ./scripts/harvest_api_reliability.sh 14d 500   # Last 14 days, limit 500
#   ./scripts/harvest_api_reliability.sh 2026-03-01 100 my-branch # Specific date and branch
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated (`gh auth login`)
#   - jq installed

# Arguments & Defaults
if [[ -n "$1" && $1 =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    SINCE="$1"
elif [[ -n "$1" && $1 =~ ^([0-9]+)d$ ]]; then
    DAYS="${BASH_REMATCH[1]}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        SINCE=$(date -u -v-"${DAYS}"d +%Y-%m-%d)
    else
        SINCE=$(date -u -d "${DAYS} days ago" +%Y-%m-%d)
    fi
else
    # Default to 7 days ago in YYYY-MM-DD format (UTC)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        SINCE=$(date -u -v-7d +%Y-%m-%d)
    else
        SINCE=$(date -u -d "7 days ago" +%Y-%m-%d)
    fi
fi

LIMIT=${2:-300}
BRANCH=${3:-""}
WORKFLOWS=("Testing: E2E (Chained)" "Evals: Nightly")
DEST_DIR=$(mktemp -d -t gemini-reliability-XXXXXX)
MERGED_FILE="api-reliability-summary.jsonl"

# Ensure cleanup on exit
trap 'rm -rf "$DEST_DIR"' EXIT

if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is not installed."
    exit 1
fi

# Clean start
rm -f "$MERGED_FILE"

# gh run list --created expects a date (YYYY-MM-DD) or a range
CREATED_QUERY=">=$SINCE"

for WORKFLOW in "${WORKFLOWS[@]}"; do
    echo "🔍 Fetching runs for '$WORKFLOW' created since $SINCE (max $LIMIT runs, branch: ${BRANCH:-all})..."

    # Construct arguments for gh run list
    GH_ARGS=("--workflow" "$WORKFLOW" "--created" "$CREATED_QUERY" "--limit" "$LIMIT" "--json" "databaseId" "--jq" ".[].databaseId")
    if [ -n "$BRANCH" ]; then
        GH_ARGS+=("--branch" "$BRANCH")
    fi

    RUN_IDS=$(gh run list "${GH_ARGS[@]}")
    exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo "❌ Failed to fetch runs for '$WORKFLOW' (exit code: $exit_code). Please check 'gh auth status' and permissions." >&2
        continue
    fi

    if [ -z "$RUN_IDS" ]; then
        echo "📭 No runs found for workflow '$WORKFLOW' since $SINCE."
        continue
    fi

    for ID in $RUN_IDS; do
        # Download artifacts named 'eval-logs-*'
        # Silencing output because many older runs won't have artifacts
        gh run download "$ID" -p "eval-logs-*" -D "$DEST_DIR/$ID" &>/dev/null || continue
        
        # Append to master log
        # Use find to locate api-reliability.jsonl in any subdirectory of $DEST_DIR/$ID
        find "$DEST_DIR/$ID" -type f -name "api-reliability.jsonl" -exec cat {} + >> "$MERGED_FILE" 2>/dev/null
    done
done

if [ ! -f "$MERGED_FILE" ]; then
    echo "📭 No reliability data found in the retrieved logs."
    exit 0
fi

echo -e "\n✅ Harvest Complete! Data merged into: $MERGED_FILE"
echo "------------------------------------------------"
echo "📊 Gemini API Reliability Summary (Since $SINCE)"
echo "------------------------------------------------"

cat "$MERGED_FILE" | jq -s '
  group_by(.model) | map({
    model: .[0].model,
    "500s": (map(select(.errorCode == "500")) | length),
    "503s": (map(select(.errorCode == "503")) | length),
    retries: (map(select(.status == "RETRY")) | length),
    skips: (map(select(.status == "SKIP")) | length)
  })'

echo -e "\n💡 Total events captured: $(wc -l < "$MERGED_FILE")"
