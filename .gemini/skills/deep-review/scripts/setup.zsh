# Gemini CLI Maintainer Setup
# This script should be sourced in your .zshrc

# Find the repo root relative to this script
export GEMINI_REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)

# --- Worktree-based Project Management ---
function rswitch() {
  local branch=$1
  local base_dir="$GEMINI_REPO_ROOT"
  local target_dir="$(dirname "$base_dir")/$branch"

  if [[ "$branch" == "main" ]]; then
    cd "$base_dir" && git pull
    return
  fi

  if [[ ! -d "$target_dir" ]]; then
    echo "🌿 Creating worktree for $branch..."
    cd "$base_dir"
    git fetch origin
    if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
      git worktree add "$target_dir" "origin/$branch"
    else
      git worktree add -b "$branch" "$target_dir"
    fi
  fi
  cd "$target_dir"
}

# --- PR Review Workflows ---
function review() {
  local pr_number=$1
  local branch_name=$2
  [[ -z "$pr_number" ]] && { echo "Usage: review <pr_number>"; return 1; }

  cd "$GEMINI_REPO_ROOT"
  if [[ -z "$branch_name" ]]; then
    branch_name=$(gh pr view $pr_number --json headRefName -q .headRefName 2>/dev/null)
    [[ -z "$branch_name" ]] && branch_name="pr-$pr_number"
  fi
  
  local target_dir="$(dirname "$GEMINI_REPO_ROOT")/$branch_name"
  git fetch origin "pull/$pr_number/head:refs/pull/$pr_number/head"
  [[ -d "$target_dir" ]] || git worktree add "$target_dir" "refs/pull/$pr_number/head"
  cd "$target_dir"

  npx tsx "$GEMINI_REPO_ROOT/.gemini/skills/deep-review/scripts/worker.ts" "$pr_number"
  gnightly "PR #$pr_number verification complete. Synthesize results from .gemini/logs/review-$pr_number/"
}

function rreview() {
  local pr_number=$1
  [[ -z "$pr_number" ]] && { echo "Usage: rreview <pr_number>"; return 1; }
  npx tsx "$GEMINI_REPO_ROOT/.gemini/skills/deep-review/scripts/review.ts" "$pr_number"
}

# --- Helper Functions ---
function gnightly() { "$GEMINI_REPO_ROOT/bundle/gemini.js" "$@"; }
function gemini() { gnightly "$@"; }
alias gr='go-remote'

function go-remote() {
  local branch="${1:-main}"
  local session_name="${branch//./_}"
  local remote_host=${GEMINI_REMOTE_HOST:-cli}
  ssh -t $remote_host "tmux attach-session -t $session_name 2>/dev/null || tmux new-session -s $session_name 'zsh -ic \"rswitch $branch && gemini; zsh\"'"
}
