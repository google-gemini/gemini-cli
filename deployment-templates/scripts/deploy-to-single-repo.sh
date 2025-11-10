#!/bin/bash
#
# Deploy Gemini CLI + Claude automation to a single GitHub repository
#
# Usage:
#   ./deploy-to-single-repo.sh <owner/repo> [OPTIONS]
#
# Options:
#   --config <file>    Custom config file
#   --workflows <list> Comma-separated list of workflows to deploy
#   --dry-run          Show what would be done without making changes
#   --help             Show this help message

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if repo argument provided
if [ $# -eq 0 ] || [ "$1" = "--help" ]; then
  sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \?//'
  exit 0
fi

REPO=$1
shift

# Default values
CONFIG_FILE="../config/.gemini-config.yaml"
WORKFLOWS="all"
DRY_RUN=false

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    --workflows)
      WORKFLOWS="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
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

# Main execution
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Gemini CLI + Claude Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

log_info "Target repository: $REPO"

if [ "$DRY_RUN" = true ]; then
  log_warning "DRY RUN MODE - No changes will be made"
fi

echo

# Check for gh CLI
if ! command -v gh &> /dev/null; then
  log_error "GitHub CLI (gh) is not installed"
  echo "Install it from: https://cli.github.com"
  exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
  log_error "Not authenticated with GitHub CLI"
  echo "Run: gh auth login"
  exit 1
fi

# Clone repository
log_info "Cloning repository..."
repo_name=$(basename "$REPO")
temp_dir="/tmp/gemini-deploy-$repo_name-$$"

if ! gh repo clone "$REPO" "$temp_dir" -- --depth=1 2>/dev/null; then
  log_error "Failed to clone $REPO"
  exit 1
fi

cd "$temp_dir"

# Create directories
log_info "Setting up directory structure..."
mkdir -p .gemini/commands
mkdir -p .github/workflows

# Copy configuration files
log_info "Copying configuration files..."
cp "$TEMPLATES_DIR/config/GEMINI.md" .gemini/
cp "$TEMPLATES_DIR/config/.gemini-config.yaml" .gemini/config.yaml
cp -r "$TEMPLATES_DIR/config/commands/"* .gemini/commands/

log_success "Configuration files copied"

# Copy workflow files
log_info "Copying workflow files..."
if [ "$WORKFLOWS" = "all" ]; then
  cp "$TEMPLATES_DIR/workflows/"*.yml .github/workflows/
  log_success "All workflows copied"
else
  IFS=',' read -ra WORKFLOW_LIST <<< "$WORKFLOWS"
  for workflow in "${WORKFLOW_LIST[@]}"; do
    if [ -f "$TEMPLATES_DIR/workflows/$workflow.yml" ]; then
      cp "$TEMPLATES_DIR/workflows/$workflow.yml" .github/workflows/
      log_success "Copied workflow: $workflow.yml"
    else
      log_warning "Workflow not found: $workflow.yml"
    fi
  done
fi

if [ "$DRY_RUN" = true ]; then
  echo
  log_info "Files that would be created:"
  find .gemini .github/workflows -type f
  echo
  log_warning "DRY RUN complete - no changes made"
  cd - > /dev/null
  rm -rf "$temp_dir"
  exit 0
fi

# Set up secrets
log_info "Setting up secrets..."
if [ -n "${GEMINI_API_KEY:-}" ]; then
  echo "$GEMINI_API_KEY" | gh secret set GEMINI_API_KEY -R "$REPO"
  log_success "GEMINI_API_KEY configured"
else
  log_warning "GEMINI_API_KEY not set - you'll need to add it manually"
fi

if [ -n "${CLAUDE_API_KEY:-}" ]; then
  echo "$CLAUDE_API_KEY" | gh secret set CLAUDE_API_KEY -R "$REPO"
  log_success "CLAUDE_API_KEY configured"
fi

# Commit and push changes
log_info "Committing changes..."

# Configure git
git config user.name "Gemini CLI Deployer"
git config user.email "noreply@github.com"

# Check if there are changes
if git diff --quiet && git diff --staged --quiet; then
  log_warning "No changes to commit"
  cd - > /dev/null
  rm -rf "$temp_dir"
  exit 0
fi

git add .gemini .github/workflows
git commit -m "feat: add Gemini CLI + Claude automation

- Add automated issue triage
- Add automated PR review
- Add Gemini+Claude unified workflow
- Add custom slash commands
- Configure AI assistants

Deployed by: deploy-to-single-repo.sh"

log_info "Pushing changes..."
if ! git push origin main 2>/dev/null && ! git push origin master 2>/dev/null; then
  log_error "Failed to push changes"
  cd - > /dev/null
  rm -rf "$temp_dir"
  exit 1
fi

log_success "Successfully deployed to $REPO"

# Cleanup
cd - > /dev/null
rm -rf "$temp_dir"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment Complete! 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
log_info "Next steps:"
echo "  1. Visit https://github.com/$REPO/actions"
echo "  2. Check that workflows are enabled"
echo "  3. Create a test issue or PR to try it out"
echo "  4. Customize .gemini/GEMINI.md for your project"
echo
