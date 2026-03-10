#!/bin/bash
# scripts/review.sh
# 
# Usage: ./scripts/review.sh <pr#> [model]

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <pr#> [model]"
    exit 1
fi
pr="$1"
model="${2:-gemini-3.1-pro-preview}"
REPO="google-gemini/gemini-cli"
REVIEW_DIR="$HOME/git/review/gemini-cli"

if [ ! -d "$REVIEW_DIR" ]; then
    echo "ERROR: Directory $REVIEW_DIR does not exist."
    echo ""
    echo "Please create a new gemini-cli clone at that directory to use for reviews."
    echo "Instructions:"
    echo "  mkdir -p ~/git/review"
    echo "  cd ~/git/review"
    echo "  git clone https://github.com/google-gemini/gemini-cli.git"
    exit 1
fi

# 1. Check if the PR exists before doing anything else
echo "review: Validating PR $pr on $REPO..."
if ! gh pr view "$pr" -R "$REPO" > /dev/null 2>&1; then
    echo "ERROR: Could not find PR #$pr in $REPO."
    echo "Are you sure $pr is a Pull Request number and not an Issue number?"
    exit 1
fi

echo "review: Opening PR $pr in browser..."
if [[ "$(uname)" == "Darwin" ]]; then
    open "https://github.com/$REPO/pull/$pr" || true
else
    xdg-open "https://github.com/$REPO/pull/$pr" || true
fi

echo "review: Changing directory to $REVIEW_DIR"
cd "$REVIEW_DIR" || exit 1

# 2. Fetch latest main to ensure we have a clean starting point
echo "review: Fetching latest from origin..."
git fetch origin main

# 3. Handle worktree creation
WORKTREE_PATH="pr_$pr"
if [ -d "$WORKTREE_PATH" ]; then
    echo "review: Worktree directory $WORKTREE_PATH already exists."
    # Check if it's actually a registered worktree
    if git worktree list | grep -q "$WORKTREE_PATH"; then
        echo "review: Reusing existing worktree..."
    else
        echo "review: Directory exists but is not a worktree. Cleaning up..."
        rm -rf "$WORKTREE_PATH"
    fi
fi

if [ ! -d "$WORKTREE_PATH" ]; then
    echo "review: Adding new worktree at $WORKTREE_PATH..."
    # Create a detached worktree from origin/main
    git worktree add --detach "$WORKTREE_PATH" origin/main
fi

echo "review: Changing directory to $WORKTREE_PATH"
cd "$WORKTREE_PATH" || exit 1

# 4. Checkout the PR
echo "review: Cleaning worktree and checking out PR $pr..."
git reset --hard
git clean -fd
gh pr checkout "$pr" --branch "review-$pr" -f -R "$REPO"

# 5. Clean and Build
echo "review: Clearing possibly stale node_modules..."
rm -rf node_modules 
rm -rf packages/core/dist/
rm -rf packages/cli/node_modules/
rm -rf packages/core/node_modules/

echo "review: Installing npm dependencies..."
npm install

echo "--- build ---"
temp_dir_base="${TMPDIR:-/tmp}"
build_log_file=$(mktemp "${temp_dir_base}/npm_build_log.XXXXXX") || {
    echo "Attempting to create temporary file in current directory as a fallback." >&2
    build_log_file=$(mktemp "./npm_build_log_fallback.XXXXXX")
    if [ $? -ne 0 ] || [ -z "$build_log_file" ]; then
        echo "ERROR: Critical - Failed to create any temporary build log file. Aborting." >&2
        exit 1
    fi
}

build_status=0
build_command_to_run="FORCE_COLOR=1 CLICOLOR_FORCE=1 npm run build"

echo "Running build. Output (with colors) will be shown below and saved to: $build_log_file"
echo "Build command: $build_command_to_run"

if [[ "$(uname)" == "Darwin" ]]; then
    script -q "$build_log_file" /bin/sh -c "$build_command_to_run"
    build_status=$?
else
    if script -q -e -c "$build_command_to_run" "$build_log_file"; then
        build_status=0
    else
        build_status=$?
    fi
fi

if [ $build_status -ne 0 ]; then
    echo "ERROR: npm build failed with exit status $build_status." >&2
    echo "Review output above. Full log (with color codes) was in $build_log_file." >&2
    exit 1
else
    if grep -q -i -E "\berror\b|\bfailed\b|ERR!|FATAL|critical" "$build_log_file"; then
        echo "ERROR: npm build completed with exit status 0, but suspicious error patterns were found in the build output." >&2
        echo "Review output above. Full log (with color codes) was in $build_log_file." >&2
        exit 1
    fi
    echo "npm build completed successfully (exit status 0, no critical error patterns found in log)."
    rm -f "$build_log_file"
fi

echo "-- running ---"
if ! npm start -- -m "$model" -i="/review-frontend $pr"; then
    echo "ERROR: npm start failed. Please check its output for details." >&2
    exit 1
fi
