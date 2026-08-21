# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for eval_suite.py logging filters, file loaders, and test execution."""

import json
import logging
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

from eval_suite import (
    RootWarningFilter,
    TestProgressFilter,
    load_test_files,
    parse_args,
    run_single_test,
)


def test_file_handler_logs_info_logs(tmp_path):
    """Tests that FileHandler logs standard [INFO] progress logs."""
    log_file = tmp_path / "test_logs.log"
    fh = logging.FileHandler(str(log_file), mode="w", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))

    logger = logging.getLogger("test_file_logger")
    logger.setLevel(logging.INFO)
    logger.addHandler(fh)

    # Standard INFO log
    logger.info("Starting local evaluation for test case: gemini_cli_12345")
    logger.info("[Coding Agent Tool Call]: replace_file_content with args {'file': 'src/index.ts'}")

    fh.close()
    logger.removeHandler(fh)

    assert log_file.exists()
    content = log_file.read_text(encoding="utf-8")

    assert "[INFO] test_file_logger: Starting local evaluation for test case: gemini_cli_12345" in content
    assert "[Coding Agent Tool Call]: replace_file_content" in content


def test_test_progress_filter_filters_starting_iteration():
    """Tests that TestProgressFilter blocks Starting Iteration messages from terminal output."""
    progress_filter = TestProgressFilter()

    # Should permit
    record1 = logging.LogRecord("test", logging.INFO, "", 0, "Starting local evaluation for test case: test1", (), None)
    record2 = logging.LogRecord("test", logging.INFO, "", 0, "[Cleanup] Deleting temp workspace", (), None)
    record3 = logging.LogRecord("test", logging.INFO, "", 0, "=== [LOCAL EVAL] SUCCESS: Patch Approved and Verified ===", (), None)

    # Should filter OUT
    record4 = logging.LogRecord("test", logging.INFO, "", 0, "=== [LOCAL EVAL] Starting Iteration 1/5 ===", (), None)
    record5 = logging.LogRecord("test", logging.INFO, "", 0, "Arbitrary debug log message", (), None)

    assert progress_filter.filter(record1) is True
    assert progress_filter.filter(record2) is True
    assert progress_filter.filter(record3) is True
    assert progress_filter.filter(record4) is False
    assert progress_filter.filter(record5) is False


def test_root_warning_filter():
    """Tests that RootWarningFilter blocks System step error and Task is overloaded messages."""
    root_filter = RootWarningFilter()

    rec_normal = logging.LogRecord("root", logging.WARNING, "", 0, "Normal system warning", (), None)
    rec_error1 = logging.LogRecord("root", logging.WARNING, "", 0, "WARNING:root:System step error (HTTP 429): Encountered retryable error", (), None)
    rec_error2 = logging.LogRecord("root", logging.WARNING, "", 0, "Task is overloaded (in-flight-requests)", (), None)

    assert root_filter.filter(rec_normal) is True
    assert root_filter.filter(rec_error1) is False
    assert root_filter.filter(rec_error2) is False


def test_load_test_files_single_file(tmp_path):
    """Tests loading a single test JSON file."""
    test_file = tmp_path / "gemini_cli_100.json"
    doc_dict = {"owner": "google-gemini", "repo": "gemini-cli", "issue_number": 100}
    test_file.write_text(json.dumps(doc_dict), encoding="utf-8")

    loaded = load_test_files(str(test_file))
    assert len(loaded) == 1
    assert loaded[0][0] == str(test_file)
    assert loaded[0][1]["issue_number"] == 100


def test_load_test_files_directory(tmp_path):
    """Tests loading all test JSON files from a directory."""
    for issue_num in [101, 102, 103]:
        f = tmp_path / f"gemini_cli_{issue_num}.json"
        f.write_text(json.dumps({"issue_number": issue_num}), encoding="utf-8")

    loaded = load_test_files(str(tmp_path))
    assert len(loaded) == 3
    loaded_nums = [item[1]["issue_number"] for item in loaded]
    assert loaded_nums == [101, 102, 103]


def test_parse_args():
    """Tests CLI argument parsing in eval_suite."""
    with patch("sys.argv", ["eval_suite.py", "--input-path", "/tmp/tests", "--run-name", "run_test", "--max-workers", "3", "--max-attempts", "4"]):
        args = parse_args()
        assert args.input_path == "/tmp/tests"
        assert args.run_name == "run_test"
        assert args.max_workers == 3
        assert args.max_attempts == 4


def test_run_single_test_skips_non_ok_quality(tmp_path):
    """Tests that run_single_test skips PR generation when expected_quality is not OK."""
    doc_dict = {
        "owner": "google-gemini",
        "repo": "gemini-cli",
        "issue_number": 999,
        "expected_quality": "FEATURE",
        "workable_spec": {},
    }
    file_path = str(tmp_path / "gemini_cli_999.json")

    result = run_single_test((file_path, doc_dict, str(tmp_path / "run_dir"), 5, False))

    assert result["success"] is True
    assert result["status"] == "SKIPPED_NON_OK"
    assert result["issue_num"] == 999
    assert result["diff"] == ""
