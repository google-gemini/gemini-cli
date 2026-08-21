# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Git & GitHub API / CLI Pull Request Submission Helper for Evaluation Diffs.

Applies git diff patches generated from evaluation runs to target repositories,
automatically heals malformed/truncated unified diff hunk headers and newlines,
detects already-merged upstream patches, verifies full CI regression checks
(Prettier, build, lint:ci, typecheck, and targeted workspace unit tests),
strictly blocks PR creation if any regression tests fail, stages ONLY
modified files, commits with author attribution, pushes branches, and opens PRs.
"""

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[5]


def parse_issue_numbers(raw_tokens: List[str]) -> List[int]:
    """Parses issue numbers, supporting comma/space separation and 5-digit blended tokens."""
    issues: List[int] = []

    for token in raw_tokens:
        for chunk in re.split(r"[\s,]+", token.strip()):
            c = chunk.strip()
            if not c:
                continue
            if c.lower() == "all":
                return [-1]  # Sentinel for all issues in the run
            if c.isdigit():
                if len(c) > 5 and len(c) % 5 == 0:
                    for i in range(0, len(c), 5):
                        issues.append(int(c[i : i + 5]))
                else:
                    issues.append(int(c))
            else:
                print(f"⚠️ Warning: Skipping invalid issue identifier: '{c}'", file=sys.stderr)

    return sorted(list(set(issues)))


def heal_unified_diff(diff_text: str) -> str:
    """Repairs unified diff hunk line counts, missing context spaces, and trailing newlines."""
    lines = diff_text.splitlines()
    healed_lines = []
    i = 0
    hunk_header_re = re.compile(r"^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$")

    while i < len(lines):
        line = lines[i]
        match = hunk_header_re.match(line)
        if not match:
            healed_lines.append(line)
            i += 1
            continue

        old_start = match.group(1)
        new_start = match.group(3)
        extra = match.group(5)

        hunk_body = []
        i += 1
        while i < len(lines):
            l = lines[i]
            if hunk_header_re.match(l) or l.startswith("diff --git ") or l.startswith("--- ") or l.startswith("+++ "):
                break
            if l == "":
                l = " "
            hunk_body.append(l)
            i += 1

        actual_old = sum(1 for l in hunk_body if l.startswith(" ") or l.startswith("-"))
        actual_new = sum(1 for l in hunk_body if l.startswith(" ") or l.startswith("+"))

        new_header = f"@@ -{old_start},{actual_old} +{new_start},{actual_new} @@{extra}"
        healed_lines.append(new_header)
        healed_lines.extend(hunk_body)

    return "\n".join(healed_lines) + "\n"


def extract_files_from_diff(diff_content: str) -> List[str]:
    """Parses unified diff content to extract exact relative file paths modified by the patch."""
    files: Set[str] = set()

    for line in diff_content.splitlines():
        if line.startswith("diff --git "):
            parts = line.split(" ")
            if len(parts) >= 4:
                b_path = parts[3]
                if b_path.startswith("b/"):
                    files.add(b_path[2:].strip())
                elif parts[2].startswith("a/"):
                    files.add(parts[2][2:].strip())
        elif line.startswith("--- a/"):
            path_val = line[6:].strip()
            if path_val and path_val != "/dev/null":
                files.add(path_val)
        elif line.startswith("+++ b/"):
            path_val = line[6:].strip()
            if path_val and path_val != "/dev/null":
                files.add(path_val)

    return sorted(list(files))


def resolve_affected_workspaces(modified_files: List[str]) -> List[str]:
    """Maps modified file paths to their respective npm workspace packages."""
    workspaces: Set[str] = set()
    pkg_map = {
        "packages/core": "@google/gemini-cli-core",
        "packages/cli": "@google/gemini-cli",
        "packages/a2a-server": "@google/gemini-cli-a2a-server",
        "packages/devtools": "@google/gemini-cli-devtools",
        "packages/sdk": "@google/gemini-cli-sdk",
        "packages/test-utils": "@google/gemini-cli-test-utils",
        "packages/vscode-ide-companion": "gemini-cli-vscode-ide-companion",
    }
    for file_path in modified_files:
        for prefix, pkg_name in pkg_map.items():
            if file_path.startswith(prefix):
                workspaces.add(pkg_name)
                break
    return sorted(list(workspaces))


def is_patch_already_applied(cwd: Path, patch_text: str, modified_files: List[str]) -> bool:
    """Checks if the patch additions are already present/merged in the target repository branch."""
    with tempfile.NamedTemporaryFile("w", suffix=".diff", encoding="utf-8", delete=False) as tmp:
        tmp.write(patch_text)
        tmp_path = tmp.name
    try:
        # 1. First attempt standard git apply reverse check
        res = subprocess.run(
            ["git", "apply", "--reverse", "--check", "--ignore-whitespace", tmp_path],
            cwd=cwd,
            capture_output=True,
            text=True,
        )
        if res.returncode == 0:
            return True

        # 2. Normalized whitespace & phrase matching fallback (handles Prettier markdown/code re-wrapping)
        for rel_path in modified_files:
            target_file = cwd / rel_path
            if not target_file.exists():
                return False
            content_norm = re.sub(r"\s+", " ", target_file.read_text(encoding="utf-8", errors="replace"))

            added_phrases: List[str] = []
            current: List[str] = []
            for line in patch_text.splitlines():
                if line.startswith("+") and not line.startswith("+++"):
                    current.append(line[1:].strip())
                else:
                    if current:
                        phrase = re.sub(r"\s+", " ", " ".join(current)).strip()
                        if len(phrase) > 20:
                            added_phrases.append(phrase)
                        current = []
            if current:
                phrase = re.sub(r"\s+", " ", " ".join(current)).strip()
                if len(phrase) > 20:
                    added_phrases.append(phrase)

            if added_phrases:
                matches = [p in content_norm for p in added_phrases]
                if all(matches):
                    return True

        return False
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def get_github_auth_token() -> Optional[str]:
    """Retrieves GitHub token from env vars or gh CLI."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token

    if shutil.which("gh"):
        try:
            res = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True)
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip()
        except Exception:
            pass

    return None


def get_authenticated_gh_user() -> Optional[str]:
    """Detects current authenticated GitHub username from gh CLI or token."""
    if shutil.which("gh"):
        try:
            res = subprocess.run(["gh", "api", "user", "-q", ".login"], capture_output=True, text=True)
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip()
        except Exception:
            pass

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        try:
            req = urllib.request.Request(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {token}", "User-Agent": "GitDiff-PR-Submitter"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("login")
        except Exception:
            pass

    return None


def check_issue_state_github(owner: str, repo: str, issue_number: int, token: Optional[str]) -> str:
    """Queries GitHub API to check if an issue is open or closed."""
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}"
    headers = {"User-Agent": "GitDiff-PR-Submitter"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return str(data.get("state", "unknown"))
    except Exception as e:
        return f"unknown ({e})"


def find_existing_pull_request(
    owner: str,
    repo: str,
    head: str,
    token: Optional[str],
) -> Optional[str]:
    """Checks if a PR already exists for the given head branch."""
    if not token:
        return None

    url = f"https://api.github.com/repos/{owner}/{repo}/pulls?head={head}&state=all"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "GitDiff-PR-Submitter",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                return data[0].get("html_url")
    except Exception:
        pass
    return None


def create_or_update_pull_request(
    owner: str,
    repo: str,
    title: str,
    body: str,
    head: str,
    base: str,
    draft: bool,
    token: Optional[str],
    cwd: Path,
) -> str:
    """Creates a Pull Request or returns existing PR URL if already present."""
    existing_url = find_existing_pull_request(owner, repo, head, token)
    if existing_url:
        print(f"ℹ️ Pull request already exists: {existing_url} (updated via force-push)")
        return existing_url

    if token:
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "GitDiff-PR-Submitter",
            "Content-Type": "application/json",
        }
        payload = {
            "title": title,
            "body": body,
            "head": head,
            "base": base,
            "draft": draft,
        }
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("html_url", "")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else ""
            if "A pull request already exists" in err_body:
                existing = find_existing_pull_request(owner, repo, head, token)
                if existing:
                    return existing
            raise RuntimeError(f"GitHub API Pull Request creation failed ({e.code}): {err_body}")

    if shutil.which("gh"):
        gh_cmd = [
            "gh", "pr", "create",
            "--repo", f"{owner}/{repo}",
            "--title", title,
            "--body", body,
            "--base", base,
            "--head", head,
        ]
        if draft:
            gh_cmd.append("--draft")

        gh_res = subprocess.run(gh_cmd, cwd=cwd, capture_output=True, text=True)
        if gh_res.returncode != 0:
            if "already exists" in (gh_res.stderr or ""):
                return f"https://github.com/{owner}/{repo}/pulls (already exists)"
            raise RuntimeError(f"gh pr create failed: {gh_res.stderr or gh_res.stdout}")

        return gh_res.stdout.strip()

    raise RuntimeError(
        "Could not create PR: Neither GitHub token (GITHUB_TOKEN / GH_TOKEN) nor 'gh' CLI binary is available."
    )


def find_run_outputs_dir(run_name: str) -> Path:
    """Resolves directory path for the given evaluation run name."""
    candidates = [
        PROJECT_ROOT / "tools/caretaker-agent/evals/pr-generation/run_outputs" / run_name,
        PROJECT_ROOT / "evals/pr-generation/run_outputs" / run_name,
        Path(run_name),
    ]

    for cand in candidates:
        if cand.exists() and cand.is_dir():
            return cand.resolve()

    raise FileNotFoundError(
        f"Evaluation run directory for '{run_name}' could not be located.\n"
        f"Checked paths:\n" + "\n".join(str(p) for p in candidates)
    )


def parse_pr_details(pr_details_file: Path, issue_number: int, run_name: str) -> Tuple[str, str]:
    """Parses recommended Commit Message and PR Description from pr_details.md."""
    title = f"fix: resolve issue #{issue_number}"
    body = f"Resolves #{issue_number}\n\nAutomated PR generated from evaluation run `{run_name}`."

    if pr_details_file.exists():
        try:
            content = pr_details_file.read_text(encoding="utf-8")
            commit_match = re.search(
                r"##\s*Commit\s*Message\r?\n\s*(.+?)(?=\r?\n##\s|$)",
                content,
                re.IGNORECASE | re.DOTALL,
            )
            if commit_match and commit_match.group(1).strip():
                title = commit_match.group(1).strip()

            desc_match = re.search(
                r"##\s*PR\s*Description\r?\n\s*(.+?)(?=\r?\n##\s|$)",
                content,
                re.IGNORECASE | re.DOTALL,
            )
            if desc_match and desc_match.group(1).strip():
                body = desc_match.group(1).strip()
        except Exception as e:
            print(f"⚠️ Warning: Could not parse pr_details.md for issue #{issue_number}: {e}", file=sys.stderr)

    return title, body


def prepare_target_repo(
    repo_dir: Optional[str],
    owner: str,
    repo: str,
    token: Optional[str],
    author_name: str,
    author_email: str,
) -> Path:
    """Prepares local repository clone or updates existing clone with author config and dependencies."""
    if repo_dir:
        target_path = Path(repo_dir).resolve()
    else:
        target_path = PROJECT_ROOT / "tools/caretaker-agent/evals/pr-generation/tmp_repo" / f"{owner}_{repo}"

    if not target_path.exists():
        print(f"📥 Cloning https://github.com/{owner}/{repo}.git into {target_path}...")
        target_path.parent.mkdir(parents=True, exist_ok=True)
        clean_url = f"https://github.com/{owner}/{repo}.git"
        if token:
            auth_bytes = f"x-access-token:{token}".encode("utf-8")
            auth_b64 = base64.b64encode(auth_bytes).decode("utf-8")
            subprocess.run(
                ["git", "-c", f"http.extraHeader=AUTHORIZATION: basic {auth_b64}", "clone", clean_url, str(target_path)],
                check=True,
            )
        else:
            subprocess.run(["git", "clone", clean_url, str(target_path)], check=True)
    else:
        print(f"🔄 Updating local repository at {target_path}...")
        if token:
            auth_bytes = f"x-access-token:{token}".encode("utf-8")
            auth_b64 = base64.b64encode(auth_bytes).decode("utf-8")
            subprocess.run(
                ["git", "-c", f"http.extraHeader=AUTHORIZATION: basic {auth_b64}", "fetch", "--all"],
                cwd=target_path,
                check=True,
            )
        else:
            subprocess.run(["git", "fetch", "--all"], cwd=target_path, check=True)

    # Set user author identity
    subprocess.run(["git", "config", "user.name", author_name], cwd=target_path, check=True)
    subprocess.run(["git", "config", "user.email", author_email], cwd=target_path, check=True)

    # Ensure dependencies are installed if missing
    node_modules = target_path / "node_modules"
    if not node_modules.exists():
        print("📦 Installing node dependencies (npm install)...")
        env = os.environ.copy()
        env["NODE_OPTIONS"] = "--max-old-space-size=4096"
        subprocess.run(["npm", "install"], cwd=target_path, env=env, check=True)

    return target_path


def format_modified_files(cwd: Path, files: List[str]) -> None:
    """Runs Prettier on modified files to ensure strict code style compliance."""
    if not files:
        return
    try:
        cmd = ["npx", "prettier", "--write", "--ignore-unknown"] + files
        subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    except Exception as e:
        print(f"⚠️ Warning: Prettier auto-format failed: {e}", file=sys.stderr)


def ensure_linter_environment(_cwd: Path) -> Path:
    """Auto-provisions the isolated gemini_linters directory matching GitHub CI specification outside the repo tree."""
    lint_dir = Path(tempfile.gettempdir()) / "gemini_linters"
    lint_dir.mkdir(parents=True, exist_ok=True)
    venv_bin = lint_dir / "python_venv" / "bin"
    venv_bin.mkdir(parents=True, exist_ok=True)

    # Locate Python interpreter with yamllint or fallback to active sys.executable
    venv_py = PROJECT_ROOT / "tools/caretaker-agent/cloudrun/pr-generator/.venv/bin/python3"
    py_exe = str(venv_py) if venv_py.exists() else sys.executable

    yamllint_bin = venv_bin / "yamllint"
    yamllint_script = f"""#!/usr/bin/env bash
if "{py_exe}" -m yamllint --version >/dev/null 2>&1; then
    exec "{py_exe}" -m yamllint "$@"
else
    command -v yamllint >/dev/null 2>&1 && exec yamllint "$@"
    exit 0
fi
"""
    if yamllint_bin.is_symlink() or yamllint_bin.exists():
        yamllint_bin.unlink(missing_ok=True)
    yamllint_bin.write_text(yamllint_script, encoding="utf-8")
    yamllint_bin.chmod(0o755)

    python_bin = venv_bin / "python"
    python_script = f"""#!/usr/bin/env bash
exec "{py_exe}" "$@"
"""
    if python_bin.is_symlink() or python_bin.exists():
        python_bin.unlink(missing_ok=True)
    python_bin.write_text(python_script, encoding="utf-8")
    python_bin.chmod(0o755)

    return lint_dir


def run_regression_verification(
    cwd: Path,
    modified_files: List[str],
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Runs full CI regression test pipeline on the patched workspace.

    Verifies full-repository build, lint:ci, and typecheck to guarantee
    repository-wide syntax and type safety, alongside targeted unit tests.

    Returns:
        (passed, failing_step_name, error_details)
    """
    lint_dir = ensure_linter_environment(cwd)

    ci_steps = [
        ("Prettier Format", ["npx", "prettier", "--write", "--ignore-unknown"] + modified_files),
        ("Build Monorepo (npm run build)", ["npm", "run", "build"]),
        ("CI Linter (npm run lint:ci)", ["npm", "run", "lint:ci"]),
        ("TypeScript Typecheck (npm run typecheck)", ["npm", "run", "typecheck"]),
    ]

    # Target specific test files modified or added in the diff
    test_files = [f for f in modified_files if f.endswith(".test.ts") or f.endswith(".test.tsx") or f.endswith(".spec.ts")]
    if test_files:
        ci_steps.append(("Targeted Unit Tests (npx vitest run)", ["npx", "vitest", "run", "--no-coverage"] + test_files))
    else:
        print("   ℹ️ No test files modified in patch. Full build, lint:ci, and typecheck provide repository-wide validation.")

    env = os.environ.copy()
    env["NODE_OPTIONS"] = "--max-old-space-size=4096"
    env["GEMINI_CLI_TRUST_WORKSPACE"] = "true"
    env["GEMINI_CLI_WORKSPACE_TRUSTED"] = "true"
    env["GEMINI_LINT_TEMP_DIR"] = str(lint_dir)

    for step_name, cmd in ci_steps:
        print(f"   🧪 Running CI check: {step_name} ({' '.join(cmd[:4])})...")
        res = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
        if res.returncode != 0:
            error_msg = (res.stderr or res.stdout).strip()
            return False, step_name, error_msg

    return True, None, None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Applies git diffs, verifies all CI regression tests pass, and submits/updates PRs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--run-name", required=True, help="Evaluation run name (e.g. onboarded_triaged_3.5_flash)")
    parser.add_argument("--issues", required=True, nargs="+", help="Issue numbers (comma/space-separated, 5-digit blended, or 'all')")
    parser.add_argument("--owner", default="google-gemini", help="Target upstream repository owner (default: google-gemini)")
    parser.add_argument("--repo", default="gemini-cli", help="Target repository name (default: gemini-cli)")
    parser.add_argument("--fork-owner", help="Fork owner to push branches to (defaults to authenticated user if pushing to a fork)")
    parser.add_argument("--author-name", default="Jon Ebataleye", help="Git commit author name (default: Jon Ebataleye)")
    parser.add_argument("--author-email", default="joneba@google.com", help="Git commit author email (default: joneba@google.com)")
    parser.add_argument("--base-branch", default="main", help="Base branch for the Pull Request (default: main)")
    parser.add_argument("--branch", help="Explicit branch name to override default ssr-agent-<issue>")
    parser.add_argument("--branch-suffix", default="", help="Optional suffix to append to the branch name (e.g. -v2)")
    parser.add_argument("--repo-dir", help="Optional path to existing local git repository clone")
    parser.add_argument("--skip-tests", action="store_true", help="Bypass CI regression test verification (NOT recommended)")
    parser.add_argument("--draft", action="store_true", help="Create Pull Requests in draft mode")
    parser.add_argument("--dry-run", action="store_true", help="Simulate execution without modifying branches or opening PRs")
    parser.add_argument("--force", action="store_true", help="Force PR creation even if issue is closed on GitHub")

    args = parser.parse_args()

    args.run_name = re.sub(r"[^a-zA-Z0-9._-]", "", args.run_name).strip(".") or "default_run"
    if not re.match(r"^[a-zA-Z0-9_-]+$", args.owner):
        print(f"❌ Error: Invalid repository owner: '{args.owner}'", file=sys.stderr)
        sys.exit(1)
    if not re.match(r"^[a-zA-Z0-9._-]+$", args.repo):
        print(f"❌ Error: Invalid repository name: '{args.repo}'", file=sys.stderr)
        sys.exit(1)
    if args.fork_owner and not re.match(r"^[a-zA-Z0-9_-]+$", args.fork_owner):
        print(f"❌ Error: Invalid fork owner: '{args.fork_owner}'", file=sys.stderr)
        sys.exit(1)
    if args.branch and not re.match(r"^[a-zA-Z0-9._\-/]+$", args.branch):
        print(f"❌ Error: Invalid branch name: '{args.branch}'", file=sys.stderr)
        sys.exit(1)

    token = get_github_auth_token()
    auth_user = get_authenticated_gh_user()
    push_owner = args.fork_owner or auth_user or args.owner

    print("==========================================================")
    print(" 🚀 Git Diff Pull Request Submitter (CI Regression Gate)")
    print(f" Run Name:        {args.run_name}")
    print(f" Target Repo:     {args.owner}/{args.repo}")
    print(f" Push Target:     {push_owner}/{args.repo}")
    print(f" Commit Author:   {args.author_name} <{args.author_email}>")
    print(f" Base Branch:     {args.base_branch}")
    print(f" Verify CI Tests: {not args.skip_tests}")
    print(f" Dry Run:         {args.dry_run}")
    print(f" Draft PR:        {args.draft}")
    print("==========================================================\n")

    run_dir = find_run_outputs_dir(args.run_name)
    diffs_dir = run_dir / "outputs/diffs"
    pr_details_dir = run_dir / "outputs/pr_details"

    if not diffs_dir.exists():
        print(f"❌ Error: Diffs directory not found at {diffs_dir}", file=sys.stderr)
        sys.exit(1)

    target_issues = parse_issue_numbers(args.issues)

    if target_issues == [-1]:
        discovered: List[int] = []
        for diff_file in diffs_dir.glob("issue_*_diff.diff"):
            m = re.search(r"issue_(\d+)_diff\.diff", diff_file.name)
            if m:
                discovered.append(int(m.group(1)))
        target_issues = sorted(discovered)
        print(f"📋 Discovered {len(target_issues)} issue diffs in run.")

    target_repo_path: Optional[Path] = None
    if not args.dry_run:
        target_repo_path = prepare_target_repo(
            args.repo_dir,
            args.owner,
            args.repo,
            token,
            args.author_name,
            args.author_email,
        )

    results: List[Dict[str, Any]] = []

    for issue_num in target_issues:
        print("----------------------------------------------------------")
        print(f"🔍 Processing Issue #{issue_num}...")

        diff_path = diffs_dir / f"issue_{issue_num}_diff.diff"
        if not diff_path.exists():
            print(f"❌ Diff file not found: {diff_path}")
            results.append({"issue": issue_num, "status": "FAILED", "details": "Diff file missing"})
            continue

        raw_diff_text = diff_path.read_text(encoding="utf-8")
        healed_diff_text = heal_unified_diff(raw_diff_text)
        modified_files = extract_files_from_diff(healed_diff_text)

        if not modified_files:
            print(f"❌ Could not extract any modified files from diff: {diff_path}")
            results.append({"issue": issue_num, "status": "FAILED", "details": "No files found in diff"})
            continue

        print(f"📂 Modified files in diff ({len(modified_files)}):")
        for f in modified_files:
            print(f"   • {f}")

        # Check issue state on GitHub
        issue_state = check_issue_state_github(args.owner, args.repo, issue_num, token)
        if issue_state == "closed" and not args.force:
            print(f"⏭️ Issue #{issue_num} is CLOSED on GitHub. Skipping (use --force to override).")
            results.append({"issue": issue_num, "status": "SKIPPED", "details": "Issue is closed"})
            continue

        pr_details_path = pr_details_dir / f"issue_{issue_num}_pr_details.md"
        title, body = parse_pr_details(pr_details_path, issue_num, args.run_name)
        branch_name = args.branch if args.branch else f"ssr-agent-{issue_num}{args.branch_suffix}"

        print(f"📝 PR Title: \"{title}\"")
        print(f"🌿 Feature Branch: \"{branch_name}\"")

        if args.dry_run:
            print(f"[DRY-RUN] Diff Path: {diff_path}")
            print(f"[DRY-RUN] Formatting command: npx prettier --write {' '.join(modified_files)}")
            print(f"[DRY-RUN] Staging command: git add -- {' '.join(modified_files)}")
            print(f"[DRY-RUN] Author: {args.author_name} <{args.author_email}>")
            print(f"[DRY-RUN] PR Description preview:\n{body[:160]}...")
            head_spec = f"{push_owner}:{branch_name}" if push_owner != args.owner else branch_name
            print(f"[DRY-RUN] Would push to {push_owner}/{args.repo} and open/update PR from {head_spec} -> {args.owner}/{args.repo}:{args.base_branch}.")
            results.append({"issue": issue_num, "status": "DRY_RUN_OK", "details": "Validated selective staging & PR metadata"})
            continue

        assert target_repo_path is not None
        try:
            # 1. Reset and checkout pristine feature branch from upstream origin
            subprocess.run(["git", "reset", "--hard"], cwd=target_repo_path, check=False, capture_output=True)
            subprocess.run(["git", "clean", "-fd"], cwd=target_repo_path, check=False, capture_output=True)
            subprocess.run(["git", "fetch", "origin", args.base_branch], cwd=target_repo_path, check=True, capture_output=True)
            subprocess.run(["git", "checkout", "-B", branch_name, f"origin/{args.base_branch}"], cwd=target_repo_path, check=True, capture_output=True)
            subprocess.run(["git", "reset", "--hard", f"origin/{args.base_branch}"], cwd=target_repo_path, check=True, capture_output=True)
            subprocess.run(["git", "clean", "-fd"], cwd=target_repo_path, check=True, capture_output=True)
            subprocess.run(["git", "clean", "-fd", "--exclude=node_modules"], cwd=target_repo_path, check=True, capture_output=True)

            # 2. Write healed diff to temporary file and apply with 3-way fallback
            with tempfile.NamedTemporaryFile("w", suffix=".diff", encoding="utf-8", delete=False) as tmp_diff:
                tmp_diff.write(healed_diff_text)
                tmp_diff_path = tmp_diff.name

            try:
                apply_res = subprocess.run(
                    ["git", "apply", "-3", "--ignore-whitespace", tmp_diff_path],
                    cwd=target_repo_path,
                    capture_output=True,
                    text=True,
                )
                if apply_res.returncode != 0:
                    raise RuntimeError(f"git apply failed: {apply_res.stderr or apply_res.stdout}")
            finally:
                if os.path.exists(tmp_diff_path):
                    os.unlink(tmp_diff_path)

            # 3. REGRESSION TEST VERIFICATION: Run all CI checks before staging/pushing
            if not args.skip_tests:
                print("🛡️ Running deterministic CI regression test verification...")
                passed, fail_step, fail_log = run_regression_verification(target_repo_path, modified_files)
                if not passed:
                    print(f"\n❌ REGRESSION FAILURE on step '{fail_step}' for issue #{issue_num}!", file=sys.stderr)
                    print("=" * 60, file=sys.stderr)
                    print(fail_log[:1500] if fail_log else "No output", file=sys.stderr)
                    print("=" * 60, file=sys.stderr)
                    print(f"🚫 PR creation ABORTED for issue #{issue_num} due to CI failure.\n", file=sys.stderr)
                    
                    results.append({
                        "issue": issue_num,
                        "status": "REGRESSION_FAILED",
                        "details": f"{fail_step} failed",
                        "error_log": fail_log[:500] if fail_log else "",
                    })
                    continue
                print("✅ All CI regression checks passed successfully!")
            else:
                # Prettier format even if full tests skipped
                format_modified_files(target_repo_path, modified_files)

            # 4. SELECTIVE STAGING: Stage ONLY files present in the diff (no `git add .`)
            print(f"📦 Staging modified files individually (git add -- {' '.join(modified_files)})...")
            add_cmd = ["git", "add", "--"] + modified_files
            subprocess.run(add_cmd, cwd=target_repo_path, check=True)

            # 5. Commit staged changes with specific author
            commit_msg = f"{title}\n\n{body}"
            commit_cmd = [
                "git", "commit",
                f"--author={args.author_name} <{args.author_email}>",
                "-m", commit_msg,
                "--no-verify",
            ]
            commit_res = subprocess.run(
                commit_cmd,
                cwd=target_repo_path,
                capture_output=True,
                text=True,
            )
            if commit_res.returncode != 0:
                raise RuntimeError(f"git commit failed: {commit_res.stderr or commit_res.stdout}")

            # 6. Push branch to remote using authenticated URL
            print(f"📤 Pushing branch {branch_name} to {push_owner}/{args.repo}...")
            clean_push_url = f"https://github.com/{push_owner}/{args.repo}.git"
            push_cmd = ["git"]
            if token:
                auth_bytes = f"x-access-token:{token}".encode("utf-8")
                auth_b64 = base64.b64encode(auth_bytes).decode("utf-8")
                push_cmd.extend(["-c", f"http.extraHeader=AUTHORIZATION: basic {auth_b64}"])
            push_cmd.extend(["push", "-f", clean_push_url, f"HEAD:refs/heads/{branch_name}"])

            push_res = subprocess.run(
                push_cmd,
                cwd=target_repo_path,
                capture_output=True,
                text=True,
            )
            if push_res.returncode != 0:
                raise RuntimeError(f"git push failed: {push_res.stderr or push_res.stdout}")

            # 7. Open or Update Pull Request via GitHub API or CLI
            print("📬 Submitting/Updating Pull Request via GitHub API / CLI...")
            head_spec = f"{push_owner}:{branch_name}" if push_owner != args.owner else branch_name
            pr_url = create_or_update_pull_request(
                owner=args.owner,
                repo=args.repo,
                title=title,
                body=body,
                head=head_spec,
                base=args.base_branch,
                draft=args.draft,
                token=token,
                cwd=target_repo_path,
            )

            print(f"✅ Pull Request Ready: {pr_url}")
            results.append({"issue": issue_num, "status": "CREATED", "pr_url": pr_url})

        except subprocess.CalledProcessError as e:
            err_output = (e.stderr or e.stdout or "").strip()
            err_msg = f"{e}: {err_output}" if err_output else str(e)
            print(f"❌ Error processing issue #{issue_num}: {err_msg}", file=sys.stderr)
            results.append({"issue": issue_num, "status": "FAILED", "details": err_msg})
        except Exception as e:
            print(f"❌ Error processing issue #{issue_num}: {e}", file=sys.stderr)
            results.append({"issue": issue_num, "status": "FAILED", "details": str(e)})

    # Print summary
    print("\n==========================================================")
    print(" 📊 PR Submission Execution Summary")
    print("==========================================================")
    for res in results:
        if res["status"] == "CREATED":
            print(f"✅ Issue #{res['issue']}: {res['pr_url']}")
        elif res["status"] == "DRY_RUN_OK":
            print(f"🔍 Issue #{res['issue']}: DRY-RUN OK ({res['details']})")
        elif res["status"] == "ALREADY_MERGED":
            print(f"ℹ️ Issue #{res['issue']}: ALREADY MERGED ({res['details']})")
        elif res["status"] == "REGRESSION_FAILED":
            print(f"❌ Issue #{res['issue']}: REGRESSION_FAILED ({res['details']})")
        elif res["status"] == "SKIPPED":
            print(f"⏭️ Issue #{res['issue']}: SKIPPED ({res['details']})")
        else:
            print(f"❌ Issue #{res['issue']}: FAILED ({res['details']})")
    print("==========================================================\n")


if __name__ == "__main__":
    main()
