# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for evals.triage.tools.generate_golden_issue."""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# Ensure caretaker root and evals are in sys.path
TRIAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CARETAKER_ROOT = os.path.abspath(os.path.join(TRIAGE_DIR, "..", ".."))

for p in (TRIAGE_DIR, CARETAKER_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

from evals.triage.tools.generate_golden_issue import (
    batch_generate_golden_issues,
    generate_golden_issue,
    get_output_filename,
    main,
)


def test_get_output_filename():
    """Tests dynamic output filename generation based on repository name."""
    assert get_output_filename("gemini-cli", 17733) == "gemini_cli_17733.json"
    assert get_output_filename("custom-repo", 456) == "custom_repo_456.json"
    assert get_output_filename("my_repo_name", 789) == "my_repo_name_789.json"


def test_generate_golden_issue_firestore_format(tmp_path):
    """Tests generating golden issue JSON in Firestore format."""
    issue_data = {
        "title": "Bug in config loader",
        "body": "Detailed description of bug",
        "createdAt": "2026-01-28T03:35:15Z",
    }
    pr_data = {
        "baseRefOid": "abcd1234efgh5678",
        "diff": "diff --git a/config.ts b/config.ts\n+fix",
    }

    mock_spec_res = {
        "workable_spec": {
            "summary": {"problem": "Config bug", "root_cause": "Typo", "context": "Loader"},
            "implementation_plan": {"files_to_modify": ["config.ts"], "steps": ["Fix typo"]},
            "testing_strategy": {"test_file": "config.test.ts", "framework": "Vitest"},
        },
        "golden_spec_rationale": "Pruned lockfiles and docs.",
    }

    with patch("evals.triage.tools.generate_golden_issue.generate_golden_spec", return_value=mock_spec_res):
        out_file = generate_golden_issue(
            owner="google-gemini",
            repo="gemini-cli",
            issue_number=17733,
            pr_number=17734,
            issue_data=issue_data,
            pr_data=pr_data,
            output_dir=tmp_path,
        )

    assert out_file.exists()
    assert out_file.name == "gemini_cli_17733.json"

    data = json.loads(out_file.read_text(encoding="utf-8"))
    assert data["status"] == "TRIAGED"
    assert data["triage_attempts"] == 0
    assert data["generation_attempts"] == 0
    assert data["github_metadata"]["owner"] == "google-gemini"
    assert data["github_metadata"]["repo"] == "gemini-cli"
    assert data["github_metadata"]["issue_number"] == 17733
    assert data["github_metadata"]["pr_number"] == 17734
    assert data["github_metadata"]["target_version"] == "abcd1234efgh5678"
    assert data["workable_spec"]["summary"]["problem"] == "Config bug"
    assert data["golden_spec_rationale"] == "Pruned lockfiles and docs."
    assert "lock" in data
    assert "error" in data


def test_main_cli_dispatch(tmp_path):
    """Tests CLI main function dispatching to generate_golden_issue."""
    with patch("evals.triage.tools.generate_golden_issue.generate_golden_issue") as mock_gen:
        test_args = [
            "generate_golden_issue.py",
            "--issue", "17733",
            "--pr", "17734",
            "--owner", "google-gemini",
            "--repo", "gemini-cli",
            "--output-dir", str(tmp_path),
        ]
        with patch("sys.argv", test_args):
            main()

        mock_gen.assert_called_once_with(
            owner="google-gemini",
            repo="gemini-cli",
            issue_number=17733,
            pr_number=17734,
            output_dir=str(tmp_path),
        )


def test_batch_generate_golden_issues_concurrent(tmp_path):
    """Tests batch generation with multiple issues executing concurrently."""
    with patch("evals.triage.tools.generate_golden_issue.generate_golden_issue") as mock_gen:
        test_args = [
            "generate_golden_issue.py",
            "--issue", "101", "102", "103",
            "--pr", "201", "202",
            "--max-workers", "4",
        ]
        with patch("sys.argv", test_args):
            main()

        assert mock_gen.call_count == 3
        mock_gen.assert_any_call(
            owner="google-gemini",
            repo="gemini-cli",
            issue_number=101,
            pr_number=201,
            output_dir=None,
        )
        mock_gen.assert_any_call(
            owner="google-gemini",
            repo="gemini-cli",
            issue_number=102,
            pr_number=202,
            output_dir=None,
        )
        mock_gen.assert_any_call(
            owner="google-gemini",
            repo="gemini-cli",
            issue_number=103,
            pr_number=None,
            output_dir=None,
        )
