# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for evals/pr-generation/tools/create_pr_from_diff.py helper."""

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

PR_GEN_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CARETAKER_ROOT = os.path.abspath(os.path.join(PR_GEN_DIR, "..", ".."))
WORKFLOW_DIR = os.path.join(CARETAKER_ROOT, "cloudrun", "pr-generator", "workflow")
TOOLS_DIR = os.path.join(PR_GEN_DIR, "tools")

for p in (TOOLS_DIR, PR_GEN_DIR, CARETAKER_ROOT, WORKFLOW_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from create_pr_from_diff import (
    check_issue_state_github,
    create_or_update_pull_request,
    extract_files_from_diff,
    find_existing_pull_request,
    get_authenticated_gh_user,
    get_github_auth_token,
    heal_unified_diff,
    is_patch_already_applied,
    main,
    parse_issue_numbers,
    parse_pr_details,
    resolve_affected_workspaces,
    run_regression_verification,
)


def test_parse_issue_numbers():
    assert parse_issue_numbers(["100", "200"]) == [100, 200]
    assert parse_issue_numbers(["100, 200, 300"]) == [100, 200, 300]
    assert parse_issue_numbers(["1234567890"]) == [12345, 67890]
    assert parse_issue_numbers(["all"]) == [-1]
    assert parse_issue_numbers(["ALL"]) == [-1]
    assert parse_issue_numbers(["invalid", "456"]) == [456]


def test_heal_unified_diff():
    broken_diff = """@@ -10,0 +10,0 @@
-const a = 1;
+const a = 2;
"""
    healed = heal_unified_diff(broken_diff)
    assert "@@ -10,1 +10,1 @@" in healed
    assert "+const a = 2;" in healed


def test_extract_files_from_diff():
    diff_text = """diff --git a/packages/core/src/index.ts b/packages/core/src/index.ts
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/packages/cli/src/main.ts b/packages/cli/src/main.ts
--- a/packages/cli/src/main.ts
+++ b/packages/cli/src/main.ts
@@ -1,1 +1,1 @@
-old
+new
"""
    files = extract_files_from_diff(diff_text)
    assert files == ["packages/cli/src/main.ts", "packages/core/src/index.ts"]


def test_resolve_affected_workspaces():
    files = [
        "packages/core/src/index.ts",
        "packages/cli/src/main.ts",
        "packages/unknown/file.ts",
    ]
    workspaces = resolve_affected_workspaces(files)
    assert workspaces == ["@google/gemini-cli", "@google/gemini-cli-core"]


def test_is_patch_already_applied_fallback(tmp_path):
    repo_file = tmp_path / "src" / "sample.ts"
    repo_file.parent.mkdir(parents=True, exist_ok=True)
    repo_file.write_text("export function test() { const fixedLongPhraseHere = 42; }", encoding="utf-8")

    patch_text = """diff --git a/src/sample.ts b/src/sample.ts
--- a/src/sample.ts
+++ b/src/sample.ts
@@ -1,1 +1,1 @@
+export function test() { const fixedLongPhraseHere = 42; }
"""
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1)
        applied = is_patch_already_applied(tmp_path, patch_text, ["src/sample.ts"])
        assert applied is True


def test_parse_pr_details_exists(tmp_path):
    pr_details_file = tmp_path / "issue_100_pr_details.md"
    pr_details_file.write_text("""## Commit Message
fix(core): resolve config parsing error

## PR Description
Fixes #100 by validating config parameters.
""", encoding="utf-8")

    title, body = parse_pr_details(pr_details_file, 100, "run_test")
    assert title == "fix(core): resolve config parsing error"
    assert "Fixes #100 by validating config parameters." in body


def test_parse_pr_details_missing(tmp_path):
    missing_file = tmp_path / "missing.md"
    title, body = parse_pr_details(missing_file, 999, "run_test")
    assert title == "fix: resolve issue #999"
    assert "Resolves #999" in body


def test_get_github_auth_token():
    with patch.dict(os.environ, {"GITHUB_TOKEN": "token_123"}, clear=True):
        assert get_github_auth_token() == "token_123"

    with patch.dict(os.environ, {"GH_TOKEN": "token_gh"}, clear=True):
        assert get_github_auth_token() == "token_gh"

    with patch.dict(os.environ, {}, clear=True), patch("shutil.which", return_value="/bin/gh"), patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="cli_token\n")
        assert get_github_auth_token() == "cli_token"


@patch("urllib.request.urlopen")
def test_get_authenticated_gh_user_api(mock_urlopen):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({"login": "testuser"}).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    with patch.dict(os.environ, {"GITHUB_TOKEN": "valid_token"}, clear=True), patch("shutil.which", return_value=None):
        user = get_authenticated_gh_user()
        assert user == "testuser"


@patch("urllib.request.urlopen")
def test_check_issue_state_github(mock_urlopen):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({"state": "open"}).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    state = check_issue_state_github("google-gemini", "gemini-cli", 100, "token")
    assert state == "open"


@patch("urllib.request.urlopen")
def test_find_existing_pull_request(mock_urlopen):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps([{"html_url": "https://github.com/google-gemini/gemini-cli/pull/1"}]).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    url = find_existing_pull_request("google-gemini", "gemini-cli", "user:branch", "token")
    assert url == "https://github.com/google-gemini/gemini-cli/pull/1"


@patch("urllib.request.urlopen")
def test_create_or_update_pull_request_api(mock_urlopen, tmp_path):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({"html_url": "https://github.com/google-gemini/gemini-cli/pull/2"}).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    with patch("create_pr_from_diff.find_existing_pull_request", return_value=None):
        url = create_or_update_pull_request(
            owner="google-gemini",
            repo="gemini-cli",
            title="fix: bug",
            body="description",
            head="user:feat",
            base="main",
            draft=False,
            token="token",
            cwd=tmp_path,
        )
        assert url == "https://github.com/google-gemini/gemini-cli/pull/2"


@patch("subprocess.run")
def test_run_regression_verification(mock_run, tmp_path):
    mock_run.return_value = MagicMock(returncode=0, stdout="pass", stderr="")

    passed, fail_step, fail_log = run_regression_verification(tmp_path, ["packages/core/src/index.ts"])
    assert passed is True
    assert fail_step is None

    # Test failure
    mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Lint error")
    passed, fail_step, fail_log = run_regression_verification(tmp_path, ["packages/core/src/index.ts"])
    assert passed is False
    assert fail_step is not None
    assert "Lint error" in fail_log


def test_main_dry_run(tmp_path):
    run_dir = tmp_path / "eval" / "run_outputs" / "run_test"
    diffs_dir = run_dir / "outputs" / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    (diffs_dir / "issue_100_diff.diff").write_text("""diff --git a/packages/core/src/index.ts b/packages/core/src/index.ts
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -1,1 +1,1 @@
-old
+new
""", encoding="utf-8")

    test_args = [
        "create_pr_from_diff.py",
        "--run-name", "run_test",
        "--issues", "100",
        "--owner", "google-gemini",
        "--repo", "gemini-cli",
        "--dry-run",
    ]

    with patch("create_pr_from_diff.find_run_outputs_dir", return_value=run_dir), \
         patch("create_pr_from_diff.check_issue_state_github", return_value="open"), \
         patch("sys.argv", test_args):
        main()
