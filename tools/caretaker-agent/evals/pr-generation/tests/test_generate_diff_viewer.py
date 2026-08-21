# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for eval/generate_diff_viewer.py interactive HTML report generator."""

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure evals/pr-generation and workflow directory are in sys.path
PR_GEN_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CARETAKER_ROOT = os.path.abspath(os.path.join(PR_GEN_DIR, "..", ".."))
WORKFLOW_DIR = os.path.join(CARETAKER_ROOT, "cloudrun", "pr-generator", "workflow")

for p in (PR_GEN_DIR, CARETAKER_ROOT, WORKFLOW_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from generate_diff_viewer import (
    fetch_true_diff,
    find_diff_file,
    generate_html_report,
    get_original_file_content,
    main,
    parse_modified_files,
)


def test_parse_modified_files():
    diff_text = """diff --git a/src/index.ts b/src/index.ts
index 123..456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,3 @@
-const x = 1;
+const x = 2;
diff --git a/src/index.test.ts b/src/index.test.ts
index 789..012 100644
--- a/src/index.test.ts
+++ b/src/index.test.ts
@@ -10,3 +10,3 @@
"""
    result = parse_modified_files(diff_text)
    assert result == ["src/index.ts", "src/index.test.ts"]


def test_parse_modified_files_deleted_and_added_files():
    diff_text = """diff --git a/src/deleted.ts b/dev/null
--- a/src/deleted.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-const old = true;
diff --git a/dev/null b/src/created.ts
--- /dev/null
+++ b/src/created.ts
@@ -0,0 +1,5 @@
+const newFile = true;
diff --git a/src/modified.ts b/src/modified.ts
--- a/src/modified.ts
+++ b/src/modified.ts
@@ -1,1 +1,1 @@
-mod
+mod2
"""
    result = parse_modified_files(diff_text)
    assert result == ["src/deleted.ts", "src/created.ts", "src/modified.ts"]


@patch("urllib.request.urlopen")
def test_get_original_file_content_success(mock_urlopen):
    mock_response = MagicMock()
    mock_response.read.return_value = b"console.log('original content');"
    mock_response.__enter__.return_value = mock_response
    mock_urlopen.return_value = mock_response

    content = get_original_file_content("main", "src/index.ts", "google-gemini", "gemini-cli")
    assert content == "console.log('original content');"


@patch("urllib.request.urlopen", side_effect=RuntimeError("HTTP 404"))
def test_get_original_file_content_error_fallback(mock_urlopen):
    content = get_original_file_content("main", "src/missing.ts", "google-gemini", "gemini-cli")
    assert "Original file content unavailable" in content


def test_get_original_file_content_version_and_null_byte_validation():
    """Tests that get_original_file_content rejects traversal, null bytes, and invalid versions."""
    assert "unavailable" in get_original_file_content("../main", "src/index.ts")
    assert "unavailable" in get_original_file_content("main\x00", "src/index.ts")
    assert "unavailable" in get_original_file_content("main", "src/index.ts\x00")
    assert "unavailable" in get_original_file_content("main;rm", "src/index.ts")
    assert "unavailable" in get_original_file_content("main", "../src/index.ts")
    assert "unavailable" in get_original_file_content("main", "src/index.ts", owner="evil/owner")
    assert "unavailable" in get_original_file_content("main", "src/index.ts", repo="evil/repo")


@patch("urllib.request.urlopen")
def test_fetch_true_diff_success(mock_urlopen):
    mock_response = MagicMock()
    mock_response.read.return_value = b"diff --git a/file.ts b/file.ts\n+added"
    mock_response.__enter__.return_value = mock_response
    mock_urlopen.return_value = mock_response

    diff = fetch_true_diff("google-gemini", "gemini-cli", 1234)
    assert diff == "diff --git a/file.ts b/file.ts\n+added"


@patch("urllib.request.urlopen")
def test_fetch_true_diff_invalid_inputs(mock_urlopen):
    """Tests that fetch_true_diff rejects invalid inputs without network calls."""
    assert fetch_true_diff("evil@owner", "gemini-cli", 123) == ""
    assert fetch_true_diff("google-gemini", "evil/repo", 123) == ""
    assert fetch_true_diff("google-gemini", "gemini-cli", 0) == ""
    assert fetch_true_diff("google-gemini", "gemini-cli", -1) == ""
    assert mock_urlopen.call_count == 0



def test_find_diff_file(tmp_path):
    diffs_dir = tmp_path / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    target_diff = diffs_dir / "gemini_cli_12345_diff.diff"
    target_diff.write_text("diff content", encoding="utf-8")

    found = find_diff_file(diffs_dir, "gemini_cli_12345", 12345)
    assert found == target_diff


def test_generate_html_report_escapes_xss():
    test_cases = [
        {
            "test_id": "test_xss",
            "issue_number": 99,
            "title": "Bug with <script> tag",
            "score": 3,
            "verdict_description": "Fixed <script>alert('XSS')</script> vulnerability.",
            "proposed_diff": "+ <script>console.log('safe')</script>",
            "true_diff": "+ <script>console.log('safe')</script>",
            "original_files": {"src/index.html": "<script>var x = 1;</script>"},
        }
    ]
    html = generate_html_report("test_run", test_cases)

    # Verify script breakout sequence </script> inside JSON is Unicode escaped
    assert "<script>alert('XSS')</script>" not in html
    assert "\\u003cscript\\u003ealert('XSS')\\u003c/script\\u003e" in html
    assert "test_run" in html
    assert "Diff2HtmlUI" in html


@patch("generate_diff_viewer.fetch_true_diff", return_value="diff --git a/f.py b/f.py\n+true")
@patch("generate_diff_viewer.get_original_file_content", return_value="# orig")
def test_main_html_report_generation(mock_get_orig, mock_fetch_diff, tmp_path):
    run_dir = tmp_path / "eval" / "run_outputs" / "run_test"
    diffs_dir = run_dir / "outputs" / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)

    (diffs_dir / "test_1_diff.diff").write_text("diff --git a/f.py b/f.py\n+prop", encoding="utf-8")

    specs_dir = tmp_path / "golden_issues"
    specs_dir.mkdir(parents=True, exist_ok=True)
    spec_payload = {
        "github_metadata": {"owner": "google", "repo": "test-repo", "issue_number": 100, "pr_number": 101},
        "workable_spec": {"summary": {"problem": "Test Problem"}},
    }
    (specs_dir / "test_1.json").write_text(json.dumps(spec_payload), encoding="utf-8")

    # Create dummy eval_score.md for verdict reading
    score_md = run_dir / "run_test_eval_score.md"
    score_md.write_text("| ✅ PASS | `#100` | 1 | 10.0s | **3/3** | Perfect fix |\n", encoding="utf-8")

    output_html = tmp_path / "custom_out.html"

    with patch("generate_diff_viewer.RUNS_BASE_DIR", tmp_path / "eval" / "run_outputs"), \
         patch("sys.argv", ["generate_diff_viewer.py", "--run-name", "run_test", "--input-path", str(specs_dir), "--output-html", str(output_html)]):
        main()


    assert output_html.exists()
    content = output_html.read_text(encoding="utf-8")
    assert "SSR Code Generator Diff Viewer - run_test" in content
    assert "Perfect fix" in content


@patch("generate_diff_viewer.fetch_true_diff", return_value="diff --git a/f.py b/f.py\n+true")
@patch("generate_diff_viewer.get_original_file_content", return_value="# orig")
def test_main_creates_nested_output_directory(mock_get_orig, mock_fetch_diff, tmp_path):
    run_dir = tmp_path / "eval" / "run_outputs" / "run_test"
    diffs_dir = run_dir / "outputs" / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    (diffs_dir / "test_1_diff.diff").write_text("diff --git a/f.py b/f.py\n+prop", encoding="utf-8")

    specs_dir = tmp_path / "golden_issues"
    specs_dir.mkdir(parents=True, exist_ok=True)
    spec_payload = {
        "github_metadata": {"owner": "google", "repo": "test-repo", "issue_number": 100, "pr_number": 101},
        "workable_spec": {"summary": {"problem": "Test Problem"}},
    }
    (specs_dir / "test_1.json").write_text(json.dumps(spec_payload), encoding="utf-8")

    output_html = tmp_path / "nested" / "sub" / "custom_out.html"

    with patch("generate_diff_viewer.RUNS_BASE_DIR", tmp_path / "eval" / "run_outputs"), \
         patch("sys.argv", ["generate_diff_viewer.py", "--run-name", "run_test", "--input-path", str(specs_dir), "--output-html", str(output_html)]):
        main()

    assert output_html.exists()



@patch("generate_diff_viewer.fetch_true_diff")
def test_main_skips_non_ok_issues(mock_fetch_diff, tmp_path):
    """Tests that non-OK issues (FEATURE, NEEDS_INFO) skip diff fetching and are excluded from visualization."""
    run_dir = tmp_path / "eval" / "run_outputs" / "run_non_ok"
    run_dir.mkdir(parents=True, exist_ok=True)

    specs_dir = tmp_path / "issues"
    specs_dir.mkdir(parents=True, exist_ok=True)

    (specs_dir / "feature_issue.json").write_text(json.dumps({
        "expected_quality": "FEATURE",
        "github_metadata": {"owner": "google", "repo": "test", "issue_number": 200}
    }), encoding="utf-8")

    (specs_dir / "needs_info_issue.json").write_text(json.dumps({
        "expected_quality": "NEEDS_INFO",
        "github_metadata": {"owner": "google", "repo": "test", "issue_number": 201}
    }), encoding="utf-8")

    output_html = tmp_path / "non_ok_out.html"

    with patch("generate_diff_viewer.RUNS_BASE_DIR", tmp_path / "eval" / "run_outputs"), \
         patch("sys.argv", ["generate_diff_viewer.py", "--run-name", "run_non_ok", "--input-path", str(specs_dir), "--output-html", str(output_html)]):
        main()

    assert output_html.exists()
    mock_fetch_diff.assert_not_called()
    content = output_html.read_text(encoding="utf-8")
    assert "feature_issue" not in content
    assert "needs_info_issue" not in content
