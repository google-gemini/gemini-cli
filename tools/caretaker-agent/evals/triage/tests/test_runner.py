"""
Unit tests for Gemini CLI Triage Evaluation Runner and Spec Generation Mode.
"""

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

CARETAKER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if CARETAKER_DIR not in sys.path:
    sys.path.insert(0, CARETAKER_DIR)

from evals.triage.runner import eval_issue, run_suite, main


@pytest.fixture
def sample_golden_issue():
    return {
        "issue_number": 1234,
        "issue_title": "Fix crash on startup",
        "owner": "google-gemini",
        "repo": "gemini-cli",
        "target_version": "v1.0.0",
        "pr_number": 5678,
        "expected_quality": "OK",
        "expected_effort": "SMALL",
        "expected_workable_spec": {
            "summary": "Fix startup crash",
            "file_changes": ["src/index.ts"]
        }
    }


@patch("evals.triage.runner.remove_worktree")
@patch("evals.triage.runner.process_issue_triage")
@patch("evals.triage.runner.add_worktree")
def test_eval_issue_no_judge_mode(mock_add_wt, mock_process, mock_rm_wt, sample_golden_issue, tmp_path):
    mock_add_wt.return_value = ("/tmp/mock_wt", "v1.0.0")
    triage_output = {
        "triage_metadata": {
            "quality": "OK",
            "effort_estimate": "SMALL"
        },
        "workable_spec": {
            "summary": "Generated spec summary",
            "files": ["src/main.ts"]
        }
    }
    mock_process.return_value = (True, json.dumps(triage_output))

    result = eval_issue(
        golden_issue=sample_golden_issue,
        worker_id=0,
        judge=False,
        output_dir=tmp_path
    )

    assert result["success"] is True
    assert result["issue_number"] == 1234
    assert "spec_doc" in result
    spec_doc = result["spec_doc"]
    assert spec_doc["issue_number"] == 1234
    assert spec_doc["status"] == "OK"
    assert spec_doc["effort"] == "SMALL"
    assert spec_doc["github_metadata"]["owner"] == "google-gemini"
    assert spec_doc["github_metadata"]["repo"] == "gemini-cli"
    assert spec_doc["github_metadata"]["target_version"] == "v1.0.0"
    assert spec_doc["workable_spec"]["summary"] == "Generated spec summary"

    # Verify file saved to disk
    expected_file = tmp_path / "gemini_cli_1234.json"
    assert expected_file.exists()
    saved_data = json.loads(expected_file.read_text())
    assert saved_data["issue_number"] == 1234
    assert saved_data["workable_spec"]["files"] == ["src/main.ts"]
    mock_rm_wt.assert_called_once_with(0)


@patch("evals.triage.runner.remove_worktree")
@patch("evals.triage.runner.evaluate_categorization")
@patch("evals.triage.runner.judge_workable_spec")
@patch("evals.triage.runner.process_issue_triage")
@patch("evals.triage.runner.add_worktree")
def test_eval_issue_judge_mode(mock_add_wt, mock_process, mock_judge, mock_cat, mock_rm_wt, sample_golden_issue):
    mock_add_wt.return_value = ("/tmp/mock_wt", "v1.0.0")
    triage_output = {
        "triage_metadata": {"quality": "OK", "effort_estimate": "SMALL"},
        "workable_spec": {"summary": "Generated spec"}
    }
    mock_process.return_value = (True, json.dumps(triage_output))
    mock_cat.return_value = {"match": True}
    mock_judge.return_value = {"overall_score": 95}

    result = eval_issue(
        golden_issue=sample_golden_issue,
        worker_id=1,
        judge=True
    )

    assert result["success"] is True
    assert result["issue_number"] == 1234
    assert result["cat_eval"] == {"match": True}
    assert result["spec_grade"] == {"overall_score": 95}
    mock_judge.assert_called_once()
    mock_cat.assert_called_once()
    mock_rm_wt.assert_called_once_with(1)


@patch("evals.triage.runner.get_repo")
@patch("evals.triage.runner.eval_issue")
@patch("evals.triage.runner.load_issues")
def test_run_suite_no_judge(mock_load, mock_eval, mock_get_repo, sample_golden_issue, tmp_path):
    mock_load.return_value = [sample_golden_issue]
    mock_eval.return_value = {"success": True, "issue_number": 1234}

    results = run_suite(
        filter_issues="all",
        concurrency=2,
        judge=False,
        output_dir=tmp_path
    )

    assert len(results) == 1
    assert results[0]["success"] is True
    mock_eval.assert_called_once_with(sample_golden_issue, worker_id=0, judge=False, output_dir=tmp_path)


@patch("evals.triage.runner.get_repo")
@patch("evals.triage.runner.eval_issue")
@patch("evals.triage.runner.load_issues")
@patch("evals.triage.runner.get_issue_details")
@patch("evals.triage.runner.resolve_target_version")
def test_run_suite_github_fallback(mock_resolve, mock_details, mock_load, mock_eval, mock_get_repo, tmp_path):
    mock_load.return_value = []  # No issues in Firestore
    mock_details.return_value = {
        "title": "Fetched Title",
        "body": "Fetched Body"
    }
    mock_resolve.return_value = "commit_sha_123"
    mock_eval.return_value = {"success": True, "issue_number": 9999}

    results = run_suite(
        filter_issues=[9999],
        concurrency=1,
        judge=False,
        output_dir=tmp_path
    )

    assert len(results) == 1
    mock_details.assert_called_once_with("google-gemini", "gemini-cli", 9999)
    mock_resolve.assert_called_once()
    assert mock_eval.call_count == 1


@patch("evals.triage.runner.run_suite")
def test_main_cli_dispatch(mock_run):
    with patch("sys.argv", ["runner.py", "--issues", "100,200", "--concurrency", "4", "--no-judge", "--run-name", "test_run", "--output-dir", "/tmp/specs"]):
        main()

    mock_run.assert_called_once_with(
        filter_issues=[100, 200],
        concurrency=4,
        note=None,
        save=True,
        judge=False,
        run_name="test_run",
        output_dir=Path("/tmp/specs")
    )
