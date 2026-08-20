# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Unit tests for workflow/agent_runner.py."""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from agent_runner import AgentRunner, AgentRunnerError


def test_load_prompt_file_valid(tmp_path):
    """Tests loading a valid prompt markdown file from script directory."""
    prompt_file = tmp_path / "test_prompt.md"
    prompt_file.write_text("Test prompt content", encoding="utf-8")

    runner = AgentRunner(
        project_id="test-proj",
        script_dir=str(tmp_path),
    )
    content = runner._load_prompt_file("test_prompt.md")
    assert content == "Test prompt content"


def test_load_prompt_file_traversal_rejected(tmp_path):
    """Tests path traversal attempt rejection."""
    runner = AgentRunner(
        project_id="test-proj",
        script_dir=str(tmp_path / "subdir"),
    )
    (tmp_path / "subdir").mkdir()
    (tmp_path / "outside.md").write_text("secret content", encoding="utf-8")

    content = runner._load_prompt_file("../outside.md")
    assert content is None


def test_load_prompt_file_missing_returns_none(tmp_path):
    """Tests missing prompt file returns None."""
    runner = AgentRunner(
        project_id="test-proj",
        script_dir=str(tmp_path),
    )
    content = runner._load_prompt_file("non_existent.md")
    assert content is None


@pytest.mark.asyncio
async def test_run_agent_success(tmp_path):
    """Tests successful agent execution and chunk aggregation."""
    runner = AgentRunner(
        project_id="test-proj",
        script_dir=str(tmp_path),
    )

    class Text:
        text = "Hello world"
        def model_dump(self):
            return {"text": self.text}

    mock_agent = MagicMock()
    mock_response = MagicMock()
    mock_response.resolve = AsyncMock(return_value=[Text()])
    mock_agent.chat = AsyncMock(return_value=mock_response)
    mock_agent.__aenter__ = AsyncMock(return_value=mock_agent)
    mock_agent.__aexit__ = AsyncMock(return_value=None)

    with patch("agent_runner.Agent", return_value=mock_agent):
        output, chunks = await runner.run_agent(
            role="BugFixer",
            prompt="Fix the bug",
            repo_path=str(tmp_path),
        )

    assert output == "Hello world"
    assert len(chunks) == 1


@pytest.mark.asyncio
async def test_run_agent_timeout(tmp_path):
    """Tests timeout handling when agent chat exceeds deadline."""
    runner = AgentRunner(
        project_id="test-proj",
        script_dir=str(tmp_path),
    )

    mock_agent = MagicMock()
    mock_agent.chat = AsyncMock(side_effect=asyncio.TimeoutError())
    mock_agent.__aenter__ = AsyncMock(return_value=mock_agent)
    mock_agent.__aexit__ = AsyncMock(return_value=None)

    with patch("agent_runner.Agent", return_value=mock_agent):
        with pytest.raises(AgentRunnerError) as exc_info:
            await runner.run_agent(
                role="BugFixer",
                prompt="Fix the bug",
                repo_path=str(tmp_path),
            )
    assert "timeout" in str(exc_info.value).lower()
