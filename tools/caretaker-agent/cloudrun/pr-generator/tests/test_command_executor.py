# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/command_executor.py."""

import os
import subprocess
from unittest.mock import MagicMock, patch

import pytest
from command_executor import (
    CommandExecutionError,
    CommandExecutor,
    sanitize_identifier,
    sanitize_relative_path,
)


# --- Sanitization Unit Tests ---

def test_sanitize_relative_path_valid():
    """Tests that valid relative paths are normalized cleanly."""
    assert sanitize_relative_path("src/utils/file.ts") == "src/utils/file.ts"
    assert sanitize_relative_path("a/b/../c/file.ts") == "a/c/file.ts"


def test_sanitize_relative_path_traversal():
    """Tests that path traversal attempts returning '..' are rejected."""
    assert sanitize_relative_path("../secret/passwords.txt") is None
    assert sanitize_relative_path("a/../../etc/passwd") is None


def test_sanitize_relative_path_absolute():
    """Tests that absolute paths are rejected."""
    assert sanitize_relative_path("/etc/passwd") is None
    assert sanitize_relative_path("/usr/local/bin") is None


def test_sanitize_relative_path_null_bytes_and_empty():
    """Tests stripping of null bytes and handling of empty inputs."""
    assert sanitize_relative_path("src/utils\x00/file.ts") == "src/utils/file.ts"
    assert sanitize_relative_path("   \x00   ") is None
    assert sanitize_relative_path("") is None
    assert sanitize_relative_path(None) is None


def test_sanitize_identifier_valid():
    """Tests sanitization of alphanumeric identifiers with hyphens/underscores."""
    assert sanitize_identifier("feature-branch_123") == "feature-branch_123"
    assert sanitize_identifier("v1.0.0") == "v1.0.0"


def test_sanitize_identifier_injection_stripping():
    """Tests that special command injection characters are removed."""
    assert sanitize_identifier("branch; rm -rf /") == "branchrm-rf"
    assert sanitize_identifier("issue#190$(whoami)") == "issue190whoami"


def test_sanitize_identifier_empty_fallback():
    """Tests that empty or invalid inputs fall back to 'default'."""
    assert sanitize_identifier("") == "default"
    assert sanitize_identifier(None) == "default"
    assert sanitize_identifier("!!!") == "default"


# --- CommandExecutionError Tests ---

def test_command_execution_error_attributes():
    """Tests that CommandExecutionError formats exception message and stores attributes."""
    err = CommandExecutionError(
        cmd=["git", "status"],
        returncode=128,
        stdout="out_data",
        stderr="err_data",
    )
    assert "git status" in str(err)
    assert "exit code 128" in str(err)
    assert err.cmd == "git status"
    assert err.returncode == 128
    assert err.stdout == "out_data"
    assert err.stderr == "err_data"


# --- CommandExecutor.run Unit Tests ---

@patch("subprocess.run")
def test_run_list_args_success(mock_subprocess_run):
    """Tests successful command execution with a list of argument tokens."""
    mock_subprocess_run.return_value = MagicMock(
        returncode=0, stdout="hello world\n", stderr=""
    )

    output = CommandExecutor.run(["echo", "hello", "world"])
    assert output == "hello world"
    mock_subprocess_run.assert_called_once()
    args, kwargs = mock_subprocess_run.call_args
    assert args[0] == ["echo", "hello", "world"]
    assert kwargs["check"] is False


@patch("subprocess.run")
def test_run_string_command_shlex_split(mock_subprocess_run):
    """Tests that string commands are tokenized using shlex without shell=True."""
    mock_subprocess_run.return_value = MagicMock(
        returncode=0, stdout="diff output\n", stderr=""
    )

    output = CommandExecutor.run("git diff --stat origin/main")
    assert output == "diff output"
    mock_subprocess_run.assert_called_once()
    args, kwargs = mock_subprocess_run.call_args
    assert args[0] == ["git", "diff", "--stat", "origin/main"]


@patch("subprocess.run")
def test_run_inline_env_parsing(mock_subprocess_run):
    """Tests parsing of inline KEY=VALUE env prefixes in string commands."""
    mock_subprocess_run.return_value = MagicMock(
        returncode=0, stdout="installed\n", stderr=""
    )

    output = CommandExecutor.run('NODE_OPTIONS="--max-old-space-size=4096" npm ci')
    assert output == "installed"
    mock_subprocess_run.assert_called_once()
    args, kwargs = mock_subprocess_run.call_args
    assert args[0] == ["npm", "ci"]
    assert kwargs["env"].get("NODE_OPTIONS") == "--max-old-space-size=4096"


@patch("subprocess.run")
def test_run_custom_cwd_and_env(mock_subprocess_run):
    """Tests custom CWD and environment variable dict propagation."""
    mock_subprocess_run.return_value = MagicMock(
        returncode=0, stdout="ok\n", stderr=""
    )

    custom_env = {"MY_VAR": "custom_val"}
    output = CommandExecutor.run(["pwd"], cwd="/tmp/pr", env=custom_env)
    assert output == "ok"
    mock_subprocess_run.assert_called_once()
    args, kwargs = mock_subprocess_run.call_args
    assert kwargs["cwd"] == "/tmp/pr"
    assert kwargs["env"].get("MY_VAR") == "custom_val"


@patch("subprocess.run")
def test_run_non_zero_exit_code_raises_error(mock_subprocess_run):
    """Tests that a non-zero exit code raises CommandExecutionError."""
    mock_subprocess_run.return_value = MagicMock(
        returncode=1, stdout="some stdout", stderr="fatal error"
    )

    with pytest.raises(CommandExecutionError) as exc_info:
        CommandExecutor.run(["git", "checkout", "nonexistent"])

    err = exc_info.value
    assert err.returncode == 1
    assert err.stdout == "some stdout"
    assert err.stderr == "fatal error"


@patch("subprocess.run")
def test_run_timeout_expired(mock_subprocess_run):
    """Tests that subprocess timeout exceptions propagate cleanly."""
    mock_subprocess_run.side_effect = subprocess.TimeoutExpired(
        cmd="long_task", timeout=10.0
    )

    with pytest.raises(subprocess.TimeoutExpired):
        CommandExecutor.run(["sleep", "100"], timeout=10.0)
