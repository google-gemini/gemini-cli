# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/gcs_logger.py."""

import json
import os
from unittest.mock import patch, MagicMock, ANY

import pytest

from workflow.gcs_logger import (
    _get_gcs_blob_prefix,
    upload_agent_trajectory_log,
    serialize_chunks,
)


def test_get_gcs_blob_prefix_regular_and_eval(monkeypatch):
    """Tests blob prefix derivation for regular and evaluation runs."""
    # Regular run
    monkeypatch.delenv("EVAL_GCS_RUN_NAME", raising=False)
    monkeypatch.delenv("EVAL_GCS_RUN_TIMESTAMP", raising=False)

    prefix_reg = _get_gcs_blob_prefix("google-gemini", "gemini-cli", "coding_agent")
    assert prefix_reg == "google-gemini_gemini-cli/agent_traces"

    prefix_reg_traces = _get_gcs_blob_prefix("google-gemini", "gemini-cli", "agent_traces")
    assert prefix_reg_traces == "google-gemini_gemini-cli/agent_traces"

    # Eval run
    monkeypatch.setenv("EVAL_GCS_RUN_NAME", "test_run_1")
    monkeypatch.setenv("EVAL_GCS_RUN_TIMESTAMP", "20260805_120000")

    prefix_eval = _get_gcs_blob_prefix("google-gemini", "gemini-cli", "coding_agent")
    assert prefix_eval == "runs/test_run_1_20260805_120000/agent_traces"


@patch("workflow.gcs_logger.upload_to_bucket")
def test_upload_agent_trajectory_log_consolidates_and_uploads(mock_upload_to_bucket, tmp_path, monkeypatch):
    """Tests that upload_agent_trajectory_log accumulates turn trajectories and uploads full trace file to GCS."""
    monkeypatch.setenv("LOCAL_TRACE_DIR", str(tmp_path))
    monkeypatch.delenv("EVAL_GCS_RUN_NAME", raising=False)
    mock_upload_to_bucket.return_value = True

    class Chunk:
        def __init__(self, step, text):
            self.step_index = step
            self.text = text

        def model_dump(self):
            return {"step_index": self.step_index, "text": self.text}

    chunks_coding = [Chunk(1, "Coding step 1")]
    chunks_eval = [Chunk(1, "Eval step 1")]

    # First turn: Coding
    path_coding = upload_agent_trajectory_log(
        owner="google-gemini",
        repo="gemini-cli",
        agent_role_folder="coding_agent",
        issue_number=123,
        resolved_chunks=chunks_coding,
        attempt_index=1,
    )

    assert path_coding == "google-gemini_gemini-cli/agent_traces/issue_123.json"
    mock_upload_to_bucket.assert_called_with(
        "google-gemini_gemini-cli/agent_traces/issue_123.json",
        ANY,
        content_type="application/json",
    )

    local_file = tmp_path / "issue_123.json"
    assert local_file.exists()
    content = json.loads(local_file.read_text())
    assert content["issue_number"] == 123
    assert "coding_1" in content

    # Second turn: Eval
    path_eval = upload_agent_trajectory_log(
        owner="google-gemini",
        repo="gemini-cli",
        agent_role_folder="eval_agent",
        issue_number="123",
        resolved_chunks=chunks_eval,
        attempt_index=1,
    )

    assert path_eval == "google-gemini_gemini-cli/agent_traces/issue_123.json"
    content_updated = json.loads(local_file.read_text())
    assert "coding_1" in content_updated
    assert "eval_1" in content_updated


def test_serialize_chunks_handles_null_text():
    """Tests that serialize_chunks gracefully handles Text chunks with None text values."""
    class Text:
        def model_dump(self):
            return {"step_index": 1, "text": None}

    res = serialize_chunks([Text()])
    parsed = json.loads(res)
    assert len(parsed) == 1
    assert parsed[0]["text"] == ""


@patch("workflow.gcs_logger.upload_to_bucket")
def test_upload_eval_run_artifacts_binary_and_symlinks(mock_upload_to_bucket, tmp_path, monkeypatch):
    """Tests that upload_eval_run_artifacts reads binary files and skips symlinks."""
    from workflow.gcs_logger import upload_eval_run_artifacts

    monkeypatch.delenv("DISABLE_GCS_LOGGING", raising=False)
    mock_upload_to_bucket.return_value = True

    run_dir = tmp_path / "run_test"
    run_dir.mkdir()
    outputs_dir = run_dir / "outputs"
    outputs_dir.mkdir()

    # Binary file
    bin_file = outputs_dir / "image.png"
    bin_file.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00")

    # Symlink
    outside_file = tmp_path / "outside.txt"
    outside_file.write_text("secret")
    symlink_file = outputs_dir / "symlink.txt"
    try:
        os.symlink(outside_file, symlink_file)
    except (OSError, NotImplementedError):
        pass

    upload_eval_run_artifacts(str(run_dir), "run_test")

    # Verify binary file was uploaded
    mock_upload_to_bucket.assert_called_with(
        "runs/run_test/outputs/image.png",
        b"\x89PNG\r\n\x1a\n\x00\x00",
        content_type="text/plain",
        client=ANY,
    )

