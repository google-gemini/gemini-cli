#!/bin/bash
#
# Check deployment status of Gemini CLI across repositories
#
# Usage:
#   ./check-deployment-status.sh [OPTIONS]
#
# Options:
#   --org <name>    Check organization repos
#   --user <name>   Check user repos
#   --repo <name>   Check specific repo
#   --detailed      Show detailed status
#   --help          Show this help message

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default values
ORG=""
USER=""
REPO=""
DETAILED=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --org)
      ORG="$2"
      shift 2
      ;;
    --user)
      USER="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --detailed)
      DETAILED=true
      shift
      ;;
    --help)
      sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

get_repositories() {
  if [ -n "$REPO" ]; then
    echo "$REPO"
  elif [ -n "$ORG" ]; then
    gh repo list "$ORG" --limit 1000 --json nameWithOwner -q '.[].nameWithOwner'
  elif [ -n "$USER" ]; then
    gh repo list "$USER" --limit 1000 --json nameWithOwner -q '.[].nameWithOwner'
  else
    gh repo list --limit 1000 --json nameWithOwner -q '.[].nameWithOwner'
  fi
}

check_repo_status() {
  local repo=$1
  local status="unknown"
  local details=()

  # Check if .gemini directory exists
  if gh api "repos/$repo/contents/.gemini" &>/dev/null; then
    status="deployed"

    # Check for specific files
    if gh api "repos/$repo/contents/.gemini/GEMINI.md" &>/dev/null; then
      details+=("✓ GEMINI.md")
    else
      details+=("✗ GEMINI.md missing")
      status="partial"
    fi

    if gh api "repos/$repo/contents/.gemini/config.yaml" &>/dev/null; then
      details+=("✓ config.yaml")
    else
      details+=("✗ config.yaml missing")
      status="partial"
    fi

    if gh api "repos/$repo/contents/.gemini/commands" &>/dev/null; then
      local command_count=$(gh api "repos/$repo/contents/.gemini/commands" -q 'length')
      details+=("✓ $command_count custom commands")
    else
      details+=("✗ no commands")
    fi

    # Check for workflows
    local workflow_count=0
    if gh api "repos/$repo/contents/.github/workflows" &>/dev/null; then
      local workflows=$(gh api "repos/$repo/contents/.github/workflows" -q '.[].name')
      while IFS= read -r workflow; do
        if [[ $workflow == gemini-* ]] || [[ $workflow == claude-gemini-* ]]; then
          ((workflow_count++))
          details+=("✓ $workflow")
        fi
      done <<< "$workflows"
    fi

    if [ $workflow_count -eq 0 ]; then
      details+=("✗ no workflows")
      status="partial"
    fi

    # Check for secrets
    local has_gemini_key=false
    if gh api "repos/$repo/actions/secrets" -q '.secrets[].name' 2>/dev/null | grep -q "GEMINI_API_KEY"; then
      details+=("✓ GEMINI_API_KEY configured")
      has_gemini_key=true
    else
      details+=("✗ GEMINI_API_KEY not configured")
      status="partial"
    fi

  else
    status="not_deployed"
  fi

  echo "$status|${details[*]}"
}

# Main execution
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Gemini CLI Deployment Status Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# Check for gh CLI
if ! command -v gh &> /dev/null; then
  log_error "GitHub CLI (gh) is not installed"
  exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
  log_error "Not authenticated with GitHub CLI"
  exit 1
fi

log_info "Fetching repositories..."
mapfile -t repos < <(get_repositories)

if [ ${#repos[@]} -eq 0 ]; then
  log_error "No repositories found"
  exit 1
fi

log_success "Found ${#repos[@]} repositories"
echo

# Check each repository
deployed_count=0
partial_count=0
not_deployed_count=0

for repo in "${repos[@]}"; do
  result=$(check_repo_status "$repo")
  IFS='|' read -r status details <<< "$result"

  case $status in
    deployed)
      echo -e "${GREEN}✓${NC} ${CYAN}$repo${NC} - Fully deployed"
      ((deployed_count++))
      ;;
    partial)
      echo -e "${YELLOW}⚠${NC} ${CYAN}$repo${NC} - Partially deployed"
      ((partial_count++))
      ;;
    not_deployed)
      echo -e "${RED}✗${NC} ${CYAN}$repo${NC} - Not deployed"
      ((not_deployed_count++))
      ;;
  esac

  if [ "$DETAILED" = true ] && [ -n "$details" ]; then
    IFS=' ' read -ra detail_array <<< "$details"
    for detail in "${detail_array[@]}"; do
      echo "    $detail"
    done
  fi

  echo
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo -e "${GREEN}Fully Deployed:${NC}     $deployed_count"
echo -e "${YELLOW}Partially Deployed:${NC} $partial_count"
echo -e "${RED}Not Deployed:${NC}       $not_deployed_count"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Total:                $(( deployed_count + partial_count + not_deployed_count ))"
echo

if [ $partial_count -gt 0 ] || [ $not_deployed_count -gt 0 ]; then
  echo
  log_info "To deploy to missing repos, run:"
  echo "  ./deploy-to-all-repos.sh"
  echo
fi
