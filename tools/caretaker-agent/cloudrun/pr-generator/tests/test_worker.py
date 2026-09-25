# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/worker.py."""

import logging
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from worker import IgnoreRawWsMsgFilter, main, setup_logging
from orchestrator import OrchestrationError


def test_ignore_raw_ws_msg_filter():
    """Tests that IgnoreRawWsMsgFilter filters out RAW WS MSG log records."""
    msg_filter = IgnoreRawWsMsgFilter()

    record_ws = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg="RAW WS MSG: websocket data packet", args=(), exc_info=None
    )
    assert msg_filter.filter(record_ws) is False

    record_normal = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg="Normal execution status log", args=(), exc_info=None
    )
    assert msg_filter.filter(record_normal) is True


@patch("logging.basicConfig")
def test_setup_logging(mock_basic_config):
    """Tests that setup_logging configures root logger handlers correctly."""
    setup_logging()
    mock_basic_config.assert_called_once()
    kwargs = mock_basic_config.call_args[1]
    assert kwargs["level"] == logging.INFO
    assert len(kwargs["handlers"]) == 1
    assert isinstance(kwargs["handlers"][0], logging.StreamHandler)


@pytest.mark.asyncio
@patch("worker.Config")
@patch("worker.Orchestrator")
async def test_worker_main_success(mock_orchestrator_cls, mock_config_cls):
    """Tests successful worker execution lifecycle."""
    mock_config = MagicMock()
    mock_config_cls.return_value = mock_config

    mock_orchestrator = MagicMock()
    mock_orchestrator.run = AsyncMock(return_value="PR_CREATED")
    mock_orchestrator_cls.return_value = mock_orchestrator

    await main()

    mock_config_cls.assert_called_once()
    mock_orchestrator_cls.assert_called_once_with(mock_config)
    mock_orchestrator.run.assert_called_once()


@pytest.mark.asyncio
@patch("worker.Config")
@patch("worker.Orchestrator")
async def test_worker_main_orchestration_error(mock_orchestrator_cls, mock_config_cls):
    """Tests that OrchestrationError results in sys.exit(1)."""
    mock_orchestrator = MagicMock()
    mock_orchestrator.run = AsyncMock(side_effect=OrchestrationError("Fatal loop limit"))
    mock_orchestrator_cls.return_value = mock_orchestrator

    with pytest.raises(SystemExit) as exc_info:
        await main()

    assert exc_info.value.code == 1


@pytest.mark.asyncio
@patch("worker.Config")
@patch("worker.Orchestrator")
async def test_worker_main_unexpected_exception(mock_orchestrator_cls, mock_config_cls):
    """Tests that unhandled exceptions result in sys.exit(4)."""
    mock_orchestrator = MagicMock()
    mock_orchestrator.run = AsyncMock(side_effect=RuntimeError("System crash"))
    mock_orchestrator_cls.return_value = mock_orchestrator

    with pytest.raises(SystemExit) as exc_info:
        await main()

    assert exc_info.value.code == 4
