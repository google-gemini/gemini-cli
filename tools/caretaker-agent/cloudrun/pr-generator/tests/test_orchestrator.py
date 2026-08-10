# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/orchestrator.py."""

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from orchestrator import Orchestrator, OrchestrationError
from command_executor import CommandExecutionError


@pytest.fixture
def mock_config():
    """Returns a mock Config instance for Orchestrator tests."""
    config = MagicMock()
    config.repo_url = "https://github.com/test-owner/test-repo"
    config.repo_name = "test-repo"
    config.git_token = "secret-token"
    config.pr_dir = "/tmp/pr"
    config.eval_dir = "/tmp/eval"
    config.pr_repo_path = "/tmp/pr/test-repo"
    config.eval_repo_path = "/tmp/eval/test-repo"
    config.max_attempts = 2
    config.model_name = "gemini-3.5-flash"
    config.load_and_validate_firestore_doc.return_value = {
        "github_metadata": {"owner": "test-owner", "repo": "test-repo", "issue_number": 190},
        "workable_spec": {
            "issue_id": "190",
            "title": "Fix issue 190",
            "description": "Issue description content",
        },
    }
    return config


def test_orchestrator_init(mock_config):
    """Tests Orchestrator initialization and component setup."""
    orc = Orchestrator(mock_config)
    assert orc.config == mock_config
    assert hasattr(orc, "agent_runner")


@patch("shutil.rmtree")
@patch("os.makedirs")
def test_setup_workspace(mock_makedirs, mock_rmtree, mock_config):
    """Tests workspace directory setup and cleanup."""
    orc = Orchestrator(mock_config)
    orc._setup_workspace()
    assert mock_makedirs.call_count >= 2


@patch("command_executor.CommandExecutor.run")
def test_sync_or_clone_repository(mock_cmd_run, mock_config):
    """Tests repository cloning and syncing."""
    mock_cmd_run.return_value = "git output"
    orc = Orchestrator(mock_config)

    with patch("os.path.exists", return_value=False):
        orc._sync_or_clone_repository()
    assert mock_cmd_run.call_count >= 1


@pytest.mark.asyncio
@patch("command_executor.CommandExecutor.run")
async def test_run_regression_checks_pass(mock_cmd_run, mock_config):
    """Tests _run_regression_checks when npm clean and npm ci succeed."""
    mock_cmd_run.return_value = "clean ok"
    orc = Orchestrator(mock_config)

    result = await orc._run_regression_checks()
    assert result is True


@pytest.mark.asyncio
@patch("preflight_filter.PreflightFilter.should_ignore_preflight_failure")
@patch("command_executor.CommandExecutor.run")
async def test_run_regression_checks_bypassed_failure(mock_cmd_run, mock_preflight_filter, mock_config):
    """Tests bypassing regression failures when preflight filter approves."""
    mock_cmd_run.side_effect = CommandExecutionError(
        cmd="npm run test:ci", returncode=1, stdout="FAIL src/utils/sessionCleanup.test.ts", stderr=""
    )
    mock_preflight_filter.return_value = True

    orc = Orchestrator(mock_config)
    result = await orc._run_regression_checks()
    assert result is True


@pytest.mark.asyncio
@patch("preflight_filter.PreflightFilter.should_ignore_preflight_failure")
@patch("command_executor.CommandExecutor.run")
async def test_run_regression_checks_unapproved_failure(mock_cmd_run, mock_preflight_filter, mock_config):
    """Tests handling of unapproved regression failures."""
    mock_cmd_run.side_effect = CommandExecutionError(
        cmd="npm run test:ci", returncode=1, stdout="FAIL src/auth/login.test.ts", stderr=""
    )
    mock_preflight_filter.return_value = False

    orc = Orchestrator(mock_config)
    with patch("builtins.open", MagicMock()):
        result = await orc._run_regression_checks()
    assert result is False


@patch("shutil.copyfile")
@patch("os.path.exists")
def test_save_feedback_to_coding_workspace(mock_exists, mock_copyfile, mock_config):
    """Tests copying pr_feedback.md from eval workspace to PR workspace."""
    mock_exists.return_value = True
    orc = Orchestrator(mock_config)

    orc._save_feedback_to_coding_workspace()
    mock_copyfile.assert_called_once_with(
        os.path.join(mock_config.eval_repo_path, "pr_feedback.md"),
        os.path.join(mock_config.pr_repo_path, "pr_feedback.md"),
    )


@pytest.mark.asyncio
@patch("orchestrator.acquire_lock", return_value="CLAIMED")
@patch("orchestrator.release_lock", return_value=True)
@patch("command_executor.CommandExecutor.run")
@patch("orchestrator.Orchestrator._setup_workspace")
@patch("orchestrator.Orchestrator._sync_or_clone_repository")
@patch("orchestrator.Orchestrator._run_regression_checks")
@patch("github_client.GitHubClient.create_pull_request")
async def test_run_loop_success_pr_created(
    mock_create_pr, mock_regression, mock_sync, mock_setup, mock_cmd_run, mock_release_lock, mock_acquire_lock, mock_config
):
    """Tests complete successful orchestrator run loop resulting in PR creation."""
    mock_regression.return_value = True
    mock_create_pr.return_value = "28"

    def cmd_side_effect(cmd, *args, **kwargs):
        cmd_str = str(cmd)
        if "diff --stat" in cmd_str:
            return "1 file changed, 5 insertions(+), 5 deletions(-)"
        if "diff" in cmd_str:
            return "diff --git a/file.py b/file.py\n+new line"
        if "status" in cmd_str:
            return "modified: file.py"
        return "ok"

    mock_cmd_run.side_effect = cmd_side_effect

    orc = Orchestrator(mock_config)
    orc.agent_runner.run_agent = AsyncMock()
    orc.agent_runner.run_agent.return_value = ("Coding agent completed code changes.", [])

    with patch("os.path.exists", return_value=True), \
         patch("builtins.open", MagicMock()):
        with patch.object(orc, "_run_evaluation", AsyncMock(return_value="APPROVED")):
            await orc.run()

    mock_create_pr.assert_called_once()


@pytest.mark.asyncio
@patch("orchestrator.acquire_lock", return_value="CLAIMED")
@patch("orchestrator.release_lock", return_value=True)
@patch("command_executor.CommandExecutor.run")
@patch("orchestrator.Orchestrator._setup_workspace")
@patch("orchestrator.Orchestrator._sync_or_clone_repository")
async def test_run_loop_max_attempts_exceeded(mock_sync, mock_setup, mock_cmd_run, mock_release_lock, mock_acquire_lock, mock_config):
    """Tests that run loop finishes and releases lock when max repair attempts are exhausted."""
    def cmd_side_effect(cmd, *args, **kwargs):
        cmd_str = str(cmd)
        if "diff" in cmd_str:
            return "diff --git a/file.py b/file.py\n+new line"
        return "ok"

    mock_cmd_run.side_effect = cmd_side_effect

    orc = Orchestrator(mock_config)
    orc.agent_runner.run_agent = AsyncMock(
        return_value=("Code generation output", [])
    )

    with patch("os.path.exists", return_value=False), \
         patch.object(orc, "_run_evaluation", AsyncMock(return_value="REJECTED")):
        await orc.run()

    mock_release_lock.assert_called_once()
