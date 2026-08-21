# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for eval/eval_diff_judge.py and judge prompt evaluation."""

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure evals/pr-generation directory is in sys.path
PR_GEN_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CARETAKER_ROOT = os.path.abspath(os.path.join(PR_GEN_DIR, "..", ".."))
WORKFLOW_DIR = os.path.join(CARETAKER_ROOT, "cloudrun", "pr-generator", "workflow")

for p in (PR_GEN_DIR, CARETAKER_ROOT, WORKFLOW_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)


from eval_diff_judge import (
    evaluate_single_diff,
    fetch_true_diff,
    find_golden_spec_for_test,
    load_judge_prompt_template,
    main,
)


def test_load_judge_prompt_template():
    """Tests loading the markdown judge prompt template."""
    prompt = load_judge_prompt_template()
    assert "Scoring Rubric" in prompt
    assert "{{PROPOSED_DIFF}}" in prompt
    assert "{{TRUE_DIFF}}" in prompt


@patch("urllib.request.urlopen")
def test_fetch_true_diff_success(mock_urlopen):
    """Tests fetching PR diff from GitHub."""
    mock_response = MagicMock()
    mock_response.read.return_value = b"diff --git a/file.py b/file.py\n+new line"
    mock_urlopen.return_value.__enter__.return_value = mock_response

    diff = fetch_true_diff("google-gemini", "gemini-cli", 25728)
    assert "diff --git" in diff


@patch("urllib.request.urlopen")
def test_fetch_true_diff_invalid_inputs(mock_urlopen):
    """Tests that fetch_true_diff rejects invalid owner/repo names or non-positive PR numbers without calling urlopen."""
    assert fetch_true_diff("evil@owner", "gemini-cli", 123) == ""
    assert fetch_true_diff("google-gemini", "evil/repo", 123) == ""
    assert fetch_true_diff("google-gemini", "gemini-cli", 0) == ""
    assert fetch_true_diff("google-gemini", "gemini-cli", -5) == ""
    assert fetch_true_diff("", "gemini-cli", 123) == ""
    assert mock_urlopen.call_count == 0



def test_find_golden_spec_for_test(tmp_path):
    """Tests locating matching golden issue spec by test_id using dummy spec in tmp_path."""
    spec_dir = tmp_path / "golden_issues"
    spec_dir.mkdir(parents=True, exist_ok=True)
    dummy_spec = {
        "status": "TRIAGED",
        "workable_spec": {"summary": {"problem": "Dummy bug"}},
        "github_metadata": {"owner": "google-gemini", "repo": "gemini-cli", "issue_number": 19868},
    }
    (spec_dir / "gemini_cli_19868.json").write_text(json.dumps(dummy_spec), encoding="utf-8")

    doc = find_golden_spec_for_test("gemini_cli_19868", str(spec_dir))
    assert doc is not None
    assert doc.get("status") == "TRIAGED"
    assert doc.get("github_metadata", {}).get("issue_number") == 19868


@pytest.mark.asyncio
@patch("eval_diff_judge.fetch_true_diff", return_value="diff --git a/src/skill.ts b/src/skill.ts\n+fix")
@patch("eval_diff_judge.AgentRunner")
async def test_evaluate_single_diff_score_3(mock_agent_runner_cls, mock_fetch_diff):
    """Tests evaluating a single diff that receives score 3."""
    mock_agent_runner = MagicMock()
    mock_agent_runner.run_agent = AsyncMock(
        return_value=(
            json.dumps({
                "score": 3,
                "verdict_description": "The proposed diff is identical in functionality to the true fix.",
            }),
            [],
        )
    )
    mock_agent_runner_cls.return_value = mock_agent_runner

    doc_dict = {
        "workable_spec": {"issue_id": "google-gemini/gemini-cli#25693", "summary": {}},
        "github_metadata": {"owner": "google-gemini", "repo": "gemini-cli", "pr_number": 25728, "title": "Test Bug"},
    }

    result = await evaluate_single_diff(
        "gemini_cli_25693", "+ proposed change", doc_dict, "{{PROPOSED_DIFF}} {{TRUE_DIFF}}", "gemini-3.6-flash"
    )

    assert result["overall_score"] == 6
    assert result["functional_score"] == 3
    assert result["quality_score"] == 3
    assert "identical in functionality" in result["verdict_description"]
    assert result["success"] is True


@pytest.mark.asyncio
async def test_evaluate_single_diff_non_ok_qualities():
    """Tests evaluating non-OK qualities (FEATURE, NEEDS_INFO, SPAM_EMPTY) where PR generation was skipped."""
    for quality in ["FEATURE", "NEEDS_INFO", "SPAM_EMPTY"]:
        doc_dict = {
            "expected_quality": quality,
            "github_metadata": {"owner": "google-gemini", "repo": "gemini-cli", "issue_number": 12345},
        }

        result = await evaluate_single_diff(
            "gemini_cli_12345", "", doc_dict, "{{PROPOSED_DIFF}} {{TRUE_DIFF}}", "gemini-3.6-flash"
        )

        assert result["skipped"] is True
        assert result["expected_quality"] == quality
        assert "PR generation skipped" in result["verdict_description"]
        assert quality in result["verdict_description"]
        assert result["success"] is True


@pytest.mark.asyncio
@patch("eval_diff_judge.fetch_true_diff", return_value="diff --git a/src/skill.ts b/src/skill.ts\n+fix")
@patch("eval_diff_judge.AgentRunner")
async def test_evaluate_single_diff_score_0(mock_agent_runner_cls, mock_fetch_diff):
    """Tests evaluating a single diff that receives score 0."""
    mock_agent_runner = MagicMock()
    mock_agent_runner.run_agent = AsyncMock(
        return_value=(
            json.dumps({
                "functional_score": 0,
                "quality_score": 0,
                "functional_critique": "Introduces syntax errors and breaks build.",
                "quality_critique": "Unacceptable code structure.",
                "verdict_description": "Introduces syntax errors and breaks build.",
            }),
            [],
        )
    )
    mock_agent_runner_cls.return_value = mock_agent_runner

    doc_dict = {
        "workable_spec": {"issue_id": "google-gemini/gemini-cli#25693", "summary": {}},
        "github_metadata": {"owner": "google-gemini", "repo": "gemini-cli", "pr_number": 25728, "title": "Test Bug"},
    }

    result = await evaluate_single_diff(
        "gemini_cli_25693", "+ broken code", doc_dict, "{{PROPOSED_DIFF}} {{TRUE_DIFF}}", "gemini-3.6-flash"
    )

    assert result["overall_score"] == 0
    assert result["functional_score"] == 0
    assert result["quality_score"] == 0
    assert "breaks build" in result["verdict_description"]
    assert "breaks build" in result["verdict_description"]


@patch("eval_diff_judge.evaluate_single_diff")
def test_main_report_generation(mock_eval_single, tmp_path):
    """Tests full main() evaluation run generating eval_score.txt report."""
    mock_eval_single.return_value = {
        "test_id": "gemini_cli_25693",
        "functional_score": 3,
        "quality_score": 3,
        "overall_score": 6,
        "functional_critique": "Full parity fix.",
        "quality_critique": "Exemplary code quality.",
        "verdict_description": "Full parity fix.",
        "success": True,
    }

    input_dir = tmp_path / "golden_issues"
    input_dir.mkdir(parents=True, exist_ok=True)
    (input_dir / "gemini_cli_25693.json").write_text(
        json.dumps({"expected_quality": "OK", "workable_spec": {"summary": {}}, "github_metadata": {"issue_number": 25693}}), encoding="utf-8"
    )

    runs_dir = tmp_path / "eval" / "run_outputs" / "test_run_1"
    diffs_dir = runs_dir / "outputs" / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)

    test_diff_file = diffs_dir / "gemini_cli_25693_diff.diff"
    test_diff_file.write_text("diff --git a/file.py b/file.py\n+added line")
    (runs_dir / "test_results.json").write_text(
        json.dumps([{"test_id": "gemini_cli_25693", "attempts": 2, "max_attempts": 5, "runtime_seconds": 45.2}])
    )

    with patch("eval_diff_judge.RUNS_BASE_DIR", str(tmp_path / "eval" / "run_outputs")), \
         patch("sys.argv", ["eval_diff_judge.py", "--run-name", "test_run_1", "--input-path", str(input_dir)]):
        main()

    score_file = runs_dir / "test_run_1_eval_score.md"
    assert score_file.exists()
    content = score_file.read_text()
    assert "# 📊 Diff Evaluation Score Report: test_run_1" in content
    assert "| **Average Total Score** | **6.00 / 6.00** |" in content
    assert "| **Average Functional Parity** | **3.00 / 3.00** |" in content
    assert "| **Average Production Quality** | **3.00 / 3.00** |" in content
    assert "| **Average Turns** | **2.00** |" in content
    assert "| **Average Runtime** | **45.20s** |" in content
    assert "| **Max Attempts** | **5** |" in content
    assert "| ✅ PASS | `#25693` | 2 | 45.20s | **3/3** | **3/3** | **6/6** |" in content


@pytest.mark.asyncio
@patch("eval_diff_judge.evaluate_single_diff")
async def test_eval_oversized_diff_feedback_prefix(mock_eval_single_diff, tmp_path):
    """Tests that evaluate_all_specs prefixes feedback with (Line Count Exceeded Limit: n lines)."""
    from eval_diff_judge import evaluate_all_specs

    mock_eval_single_diff.return_value = {
        "test_id": "gemini_cli_123",
        "functional_score": 3,
        "quality_score": 3,
        "overall_score": 6,
        "functional_critique": "Approved functional fix.",
        "quality_critique": "Clean production code.",
        "verdict_description": "Approved code changes.",
        "success": True,
    }

    spec_file = tmp_path / "gemini_cli_123.json"
    spec_file.write_text(
        json.dumps({"expected_quality": "OK", "workable_spec": {"summary": {}}, "github_metadata": {"issue_number": 123}}), encoding="utf-8"
    )

    diffs_dir = tmp_path / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    (diffs_dir / "gemini_cli_123_diff.diff").write_text("diff --git a/file.ts b/file.ts\n+added")

    turn_map = {"gemini_cli_123": (2, 5)}
    runtime_map = {"gemini_cli_123": 30.0}
    line_count_map = {"gemini_cli_123": 820}
    status_map = {"gemini_cli_123": "EXCEEDED_LINE_LIMIT"}
    error_map = {"gemini_cli_123": "Commit modifications (820 lines) exceed 750 lines limit."}

    results = await evaluate_all_specs(
        [str(spec_file)],
        str(diffs_dir),
        turn_map,
        runtime_map,
        line_count_map,
        status_map,
        error_map,
        prompt_template="prompt",
        model="gemini-3.6-flash",
    )

    assert len(results) == 1
    res = results[0]
    assert res["overall_score"] == 6
    assert res["functional_critique"].startswith("(Line Count Exceeded Limit: 820 lines) Approved functional fix.")
    assert res["quality_critique"].startswith("(Line Count Exceeded Limit: 820 lines) Clean production code.")

