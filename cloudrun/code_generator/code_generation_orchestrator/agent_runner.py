"""Google Antigravity SDK Agent Runner and Context Management.

Provides execution wrappers for executing Coding and Evaluator AI Agents using
the Google Antigravity SDK. Includes thread-safe working directory controls
and automatic local sandbox approvals.
"""

import contextlib
import logging
import os
from typing import Iterator


@contextlib.contextmanager
def working_directory(path: str | os.PathLike) -> Iterator[None]:
    """Safely and temporarily changes the working directory.

    Guarantees restoration of the original CWD even in the event of failures.

    Args:
        path: Directory path to switch to.

    Yields:
        None.
    """
    original_cwd = os.getcwd()
    logging.debug("Switching working directory from %s to %s", original_cwd, path)
    os.chdir(path)
    try:
        yield
    finally:
        logging.debug("Restoring working directory to %s", original_cwd)
        os.chdir(original_cwd)


# Registering global agent hooks for local sandbox tool calls
try:
    from google.antigravity import Agent, LocalAgentConfig, hooks, policy
except ImportError:
    Agent, LocalAgentConfig, hooks, policy = None, None, None, None

if hooks is not None:
    @hooks.pre_tool_call_decide
    def auto_approve_all_tools(context, tool_call) -> str:
        """Automatically approves local sandbox tool execution in headless mode."""
        logging.debug("Auto-approving sandbox tool call: %s", tool_call.name)
        return "PROCEED"


class AgentRunnerError(Exception):
    """Raised when the AI Agent fails to run or complete execution loops."""


class AgentRunner:
    """Manages AI Agent setups and coordinates conversation execution loops."""

    def __init__(
        self,
        project_id: str,
        location: str,
        model_name: str,
        script_dir: str | None = None,
    ) -> None:
        """Initializes the runner with target Vertex AI details.

        Args:
            project_id: Target Google Cloud Platform Project ID.
            location: Regional location of Vertex AI services.
            model_name: Base LLM version string.
            script_dir: Directory containing system/prompt markdown files.
        """
        self.project_id = project_id
        self.location = location
        self.model_name = model_name
        self.script_dir = script_dir or os.path.dirname(
            os.path.abspath(__file__)
        )

    def _load_prompt_file(self, filename: str) -> str | None:
        """Helper to read a localized system instruction prompt markdown file.

        Args:
            filename: Name of the prompt file inside the script directory.

        Returns:
            The text content if file exists, else None.
        """
        path = os.path.join(self.script_dir, filename)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except IOError as e:
                logging.warning(
                    "Failed to read prompt file '%s': %s", filename, e
                )
        return None

    async def run_agent(
        self,
        role: str,
        prompt: str,
        repo_path: str,
        system_prompt_file: str | None = None,
    ) -> str:
        """Launches and manages an asynchronous conversation with an Antigravity Agent.

        Args:
            role: Label representing the agent's role (e.g., 'Coding Agent').
            prompt: User message prompt guiding the immediate task.
            repo_path: Target directory root of the repository to execute in.
            system_prompt_file: Optional filename of system prompt markdown.

        Returns:
            A reconstructed single text block combining thoughts and outputs.

        Raises:
            AgentRunnerError: If Agent fails to run or execution fails.
        """
        if Agent is None:
            raise AgentRunnerError("Google Antigravity SDK is not installed.")

        logging.info("Initializing Agent '%s' inside %s", role, repo_path)

        # Build fallback / configured system instructions
        system_instructions = f"You are the {role}. You must complete the requested tasks in the workspace."
        if system_prompt_file:
            loaded_instructions = self._load_prompt_file(system_prompt_file)
            if loaded_instructions:
                system_instructions = loaded_instructions
                logging.info(
                    "System prompt successfully loaded from %s",
                    system_prompt_file
                )
            else:
                logging.warning(
                    "Requested system prompt file '%s' not found. Reverting to default instructions.",
                    system_prompt_file,
                )

        config = LocalAgentConfig(
            vertex=True,
            project=self.project_id,
            location=self.location,
            model=self.model_name,
            system_instructions=system_instructions,
            policies=[policy.allow_all()],
            workspaces=[repo_path],
        )

        stdout_list: list[str] = []
        thinking_list: list[str] = []

        try:
            # We change CWD to the repo workspace because the Antigravity SDK Agent
            # interacts relative to the current working process directory.
            with working_directory(repo_path):
                async with Agent(config) as agent:
                    logging.info(
                        "[%s] Sending initial task prompt to conversation loop...",
                        role
                    )
                    await agent.conversation.send(prompt)

                    step_contents: dict[int, str] = {}
                    step_thoughts: dict[int, str] = {}
                    printed_steps: set[tuple[int, str]] = set()

                    async for step in agent.conversation.receive_steps():
                        if step.content:
                            step_contents[step.step_index] = step.content

                        # Retrieve thoughts if available via standard properties
                        thinking = getattr(step, "thinking", None) or getattr(
                            step, "thinking_delta", None
                        )
                        if thinking:
                            step_thoughts[step.step_index] = str(thinking)

                        step_key = (step.step_index, str(step.status))
                        if step_key not in printed_steps:
                            printed_steps.add(step_key)
                            logging.info(
                                "[%s Step %s] Type: %s (Source: %s, Status: %s)",
                                role,
                                step.step_index,
                                step.type,
                                step.source,
                                step.status,
                            )
                            if step.content:
                                logging.info("[%s Content]: %s", role, step.content)
                            if thinking:
                                logging.debug("[%s Thinking]: %s", role, thinking)
                            if step.tool_calls:
                                for call in step.tool_calls:
                                    logging.info(
                                        "[%s Tool Call]: %s with args %s",
                                        role,
                                        call.name,
                                        call.args,
                                    )

                    # Accumulate outputs
                    for step_idx in sorted(step_contents.keys()):
                        stdout_list.append(step_contents[step_idx])

                    for step_idx in sorted(step_thoughts.keys()):
                        thinking_list.append(step_thoughts[step_idx])

            full_output = "\n".join(stdout_list)
            if thinking_list:
                joined_thoughts = "\n".join(thinking_list)
                full_output += f"\nThoughts:\n{joined_thoughts}"

            logging.info("Agent '%s' execution completed successfully.", role)
            return full_output

        except Exception as e:
            logging.exception("Failed to execute agent loop for role: %s", role)
            raise AgentRunnerError(f"Agent '{role}' execution failed: {e}") from e
