"""Git Repository Cloning & Isolated Worktree Lifecycle Manager."""

import subprocess
from pathlib import Path
from typing import Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
TARGET_REPO_DIR = str(BASE_DIR / "target_repo")
WORKTREES_DIR = str(BASE_DIR / "worktrees")


def get_repo() -> str:
    """Ensures base target repository google-gemini/gemini-cli is cloned and fetched once upfront."""
    if not Path(TARGET_REPO_DIR).exists():
        print(f"[EVAL] Target repository missing at {TARGET_REPO_DIR}. Cloning google-gemini/gemini-cli...")
        subprocess.run(["git", "clone", "https://github.com/google-gemini/gemini-cli.git", TARGET_REPO_DIR], check=True, timeout=120)
    else:
        try:
            subprocess.run(["git", "fetch", "--all", "--tags"], cwd=TARGET_REPO_DIR, capture_output=True, timeout=60)
        except subprocess.TimeoutExpired:
            print("  ⚠️ [EVAL WARNING] 'git fetch' timed out after 60s. Continuing with cached repository state.")
    return TARGET_REPO_DIR


def add_worktree(worker_id: int, version: str) -> Tuple[str, str]:
    """Creates an isolated, lightweight Git Worktree for a worker slot in ~10ms. Returns (worktree_dir, actual_version)."""
    worktree_dir = str(Path(WORKTREES_DIR) / f"worker_{worker_id}")
    Path(WORKTREES_DIR).mkdir(parents=True, exist_ok=True)

    # Clean up any stale worktree for this worker slot
    subprocess.run(["git", "worktree", "remove", "--force", worktree_dir], cwd=TARGET_REPO_DIR, capture_output=True)

    actual_version = version
    res = subprocess.run(["git", "worktree", "add", "-f", worktree_dir, version], cwd=TARGET_REPO_DIR, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  [EVAL] Warning: Could not checkout commit '{version[:10]}' for worker {worker_id}. Falling back to 'main'.")
        subprocess.run(["git", "worktree", "add", "-f", worktree_dir, "main"], cwd=TARGET_REPO_DIR, capture_output=True)
        actual_version = "main"

    return worktree_dir, actual_version


def remove_worktree(worker_id: int) -> None:
    """Removes a worker's temporary Git Worktree cleanly."""
    worktree_dir = str(Path(WORKTREES_DIR) / f"worker_{worker_id}")
    subprocess.run(["git", "worktree", "remove", "--force", worktree_dir], cwd=TARGET_REPO_DIR, capture_output=True)
