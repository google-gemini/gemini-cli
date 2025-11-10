#!/bin/bash
#
# Deploy Gemini CLI + Claude automation to all GitHub repositories
#
# Usage:
#   ./deploy-to-all-repos.sh [OPTIONS]
#
# Options:
#   --org <name>           Deploy to all repos in organization
#   --user <name>          Deploy to all user repos (default: current user)
#   --config <file>        Custom config file (default: ../ config/.gemini-config.yaml)
#   --workflows <list>     Comma-separated list of workflows to deploy
#   --exclude-repos <list> Comma-separated list of repos to exclude
#   --dry-run              Show what would be done without making changes
#   --update-only          Update existing deployments only
#   --rollback             Remove Gemini CLI from all repos
#   --help                 Show this help message

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ORG=""
USER=""
CONFIG_FILE="../config/.gemini-config.yaml"
WORKFLOWS="all"
EXCLUDE_REPOS=""
DRY_RUN=false
UPDATE_ONLY=false
ROLLBACK=false

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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
    --config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    --workflows)
      WORKFLOWS="$2"
      shift 2
      ;;
    --exclude-repos)
      EXCLUDE_REPOS="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --update-only)
      UPDATE_ONLY=true
      shift
      ;;
    --rollback)
      ROLLBACK=true
      shift
      ;;
    --help)
      sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
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

check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check for gh CLI
  if ! command -v gh &> /dev/null; then
    log_error "GitHub CLI (gh) is not installed"
    echo "Install it from: https://cli.github.com"
    exit 1
  fi

  # Check for authentication
  if ! gh auth status &> /dev/null; then
    log_error "Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
  fi

  # Check for required environment variables
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    log_warning "GITHUB_TOKEN not set, using gh CLI authentication"
  fi

  if [ -z "${GEMINI_API_KEY:-}" ]; then
    log_warning "GEMINI_API_KEY not set"
    echo "Set it with: export GEMINI_API_KEY='your-key'"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi

  log_success "Prerequisites check passed"
}

get_repositories() {
  log_info "Fetching repositories..."

  local repos=()

  if [ -n "$ORG" ]; then
    # Get org repos
    log_info "Fetching repositories from organization: $ORG"
    mapfile -t repos < <(gh repo list "$ORG" --limit 1000 --json nameWithOwner -q '.[].nameWithOwner')
  elif [ -n "$USER" ]; then
    # Get user repos
    log_info "Fetching repositories for user: $USER"
    mapfile -t repos < <(gh repo list "$USER" --limit 1000 --json nameWithOwner -q '.[].nameWithOwner')
  else
    # Get current user's repos
    log_info "Fetching repositories for current user"
    mapfile -t repos < <(gh repo list --limit 1000 --json nameWithOwner -q '.[].nameWithOwner')
  fi

  # Filter out excluded repos
  if [ -n "$EXCLUDE_REPOS" ]; then
    IFS=',' read -ra EXCLUDED <<< "$EXCLUDE_REPOS"
    for exclude in "${EXCLUDED[@]}"; do
      repos=("${repos[@]/$exclude}")
    done
  fi

  # Remove empty elements
  repos=("${repos[@]}")

  log_success "Found ${#repos[@]} repositories"
  echo "${repos[@]}"
}

deploy_to_repo() {
  local repo=$1

  log_info "Deploying to $repo..."

  if [ "$DRY_RUN" = true ]; then
    log_warning "[DRY RUN] Would deploy to $repo"
    return 0
  fi

  # Clone or use existing repo
  local repo_name=$(basename "$repo")
  local temp_dir="/tmp/gemini-deploy-$repo_name"

  if [ -d "$temp_dir" ]; then
    rm -rf "$temp_dir"
  fi

  # Clone the repository
  if ! gh repo clone "$repo" "$temp_dir" -- --depth=1 2>/dev/null; then
    log_error "Failed to clone $repo"
    return 1
  fi

  cd "$temp_dir"

  # Create .gemini directory
  mkdir -p .gemini/commands
  mkdir -p .github/workflows

  # Copy configuration files
  log_info "  Copying configuration files..."
  cp "$TEMPLATES_DIR/config/GEMINI.md" .gemini/
  cp "$TEMPLATES_DIR/config/.gemini-config.yaml" .gemini/config.yaml
  cp -r "$TEMPLATES_DIR/config/commands/"* .gemini/commands/

  # Copy workflow files
  log_info "  Copying workflow files..."
  if [ "$WORKFLOWS" = "all" ]; then
    cp "$TEMPLATES_DIR/workflows/"* .github/workflows/
  else
    IFS=',' read -ra WORKFLOW_LIST <<< "$WORKFLOWS"
    for workflow in "${WORKFLOW_LIST[@]}"; do
      if [ -f "$TEMPLATES_DIR/workflows/$workflow.yml" ]; then
        cp "$TEMPLATES_DIR/workflows/$workflow.yml" .github/workflows/
      fi
    done
  fi

  # Set up secrets
  if [ -n "${GEMINI_API_KEY:-}" ]; then
    log_info "  Setting up secrets..."
    echo "$GEMINI_API_KEY" | gh secret set GEMINI_API_KEY -R "$repo"
  fi

  if [ -n "${CLAUDE_API_KEY:-}" ]; then
    echo "$CLAUDE_API_KEY" | gh secret set CLAUDE_API_KEY -R "$repo"
  fi

  # Commit and push changes
  log_info "  Committing changes..."

  # Configure git
  git config user.name "Gemini CLI Deployer"
  git config user.email "noreply@github.com"

  # Check if there are changes
  if git diff --quiet && git diff --staged --quiet; then
    log_warning "  No changes to commit for $repo"
    cd - > /dev/null
    rm -rf "$temp_dir"
    return 0
  fi

  git add .gemini .github/workflows
  git commit -m "feat: add Gemini CLI + Claude automation

- Add automated issue triage
- Add automated PR review
- Add Gemini+Claude unified workflow
- Add custom slash commands
- Configure AI assistants

Deployed by: deploy-to-all-repos.sh"

  if ! git push origin main 2>/dev/null && ! git push origin master 2>/dev/null; then
    log_error "  Failed to push to $repo"
    cd - > /dev/null
    rm -rf "$temp_dir"
    return 1
  fi

  log_success "Successfully deployed to $repo"

  # Cleanup
  cd - > /dev/null
  rm -rf "$temp_dir"

  return 0
}

rollback_from_repo() {
  local repo=$1

  log_info "Rolling back from $repo..."

  if [ "$DRY_RUN" = true ]; then
    log_warning "[DRY RUN] Would rollback from $repo"
    return 0
  fi

  local repo_name=$(basename "$repo")
  local temp_dir="/tmp/gemini-rollback-$repo_name"

  if [ -d "$temp_dir" ]; then
    rm -rf "$temp_dir"
  fi

  # Clone the repository
  if ! gh repo clone "$repo" "$temp_dir" -- --depth=1 2>/dev/null; then
    log_error "Failed to clone $repo"
    return 1
  fi

  cd "$temp_dir"

  # Remove Gemini CLI files
  log_info "  Removing Gemini CLI files..."
  rm -rf .gemini
  rm -f .github/workflows/gemini-*.yml
  rm -f .github/workflows/claude-gemini-unified.yml

  # Configure git
  git config user.name "Gemini CLI Deployer"
  git config user.email "noreply@github.com"

  # Check if there are changes
  if git diff --quiet && git diff --staged --quiet; then
    log_warning "  Nothing to rollback for $repo"
    cd - > /dev/null
    rm -rf "$temp_dir"
    return 0
  fi

  git add -A
  git commit -m "chore: remove Gemini CLI automation

Rolled back by: deploy-to-all-repos.sh --rollback"

  if ! git push origin main 2>/dev/null && ! git push origin master 2>/dev/null; then
    log_error "  Failed to push rollback to $repo"
    cd - > /dev/null
    rm -rf "$temp_dir"
    return 1
  fi

  log_success "Successfully rolled back from $repo"

  # Cleanup
  cd - > /dev/null
  rm -rf "$temp_dir"

  return 0
}

# Main execution
main() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Gemini CLI + Claude Unified Deployment"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo

  check_prerequisites

  # Get repositories
  repos=($(get_repositories))

  if [ ${#repos[@]} -eq 0 ]; then
    log_error "No repositories found"
    exit 1
  fi

  echo
  log_info "Will process ${#repos[@]} repositories"

  if [ "$DRY_RUN" = true ]; then
    log_warning "DRY RUN MODE - No changes will be made"
  fi

  if [ "$ROLLBACK" = true ]; then
    log_warning "ROLLBACK MODE - Will remove Gemini CLI from repos"
  fi

  echo
  read -p "Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Aborted"
    exit 0
  fi

  echo
  log_info "Starting deployment..."
  echo

  local success_count=0
  local fail_count=0

  for repo in "${repos[@]}"; do
    if [ "$ROLLBACK" = true ]; then
      if rollback_from_repo "$repo"; then
        ((success_count++))
      else
        ((fail_count++))
      fi
    else
      if deploy_to_repo "$repo"; then
        ((success_count++))
      else
        ((fail_count++))
      fi
    fi
    echo
  done

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Deployment Complete"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo
  log_success "Successful: $success_count"
  if [ $fail_count -gt 0 ]; then
    log_error "Failed: $fail_count"
  fi
  echo

  if [ $fail_count -gt 0 ]; then
    exit 1
  fi
}

# Run main function
main
