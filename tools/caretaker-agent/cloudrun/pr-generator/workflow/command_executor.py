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

"""Command execution and input sanitization module.

Provides safe subprocess execution utilities, path traversal guards,
and input sanitizers to prevent injection attacks and capture process output cleanly.
"""

import logging
import os
import re
import shlex
import subprocess

logger = logging.getLogger("Orchestrator")


def sanitize_relative_path(path: str | os.PathLike) -> str | None:
    """Sanitizes an untrusted relative file path to prevent Path Traversal.

    Strips null bytes, normalizes path separators, and ensures the path does not
    escape the workspace or refer to an absolute root path.

    Args:
        path: Untrusted file path string or PathLike object.

    Returns:
        The normalized safe relative path string, or None if malicious/invalid.
    """
    if not path:
        return None
    raw_str = str(path).replace("\x00", "").replace("\\", "/").strip()
    if not raw_str:
        return None
    clean_path = os.path.normpath(raw_str)
    if clean_path == ".." or clean_path.startswith("../") or os.path.isabs(clean_path):
        logging.warning("Path traversal attempt or absolute path detected: %s", path)
        return None
    return clean_path


def sanitize_identifier(value: str) -> str:
    """Sanitizes an untrusted string for use in branch names, tags, or CLI identifiers.

    Strips null bytes, removes any character not in [a-zA-Z0-9._-], and strips leading hyphens and dots.

    Args:
        value: Untrusted identifier string.

    Returns:
        A sanitized alphanumeric identifier string (defaults to 'default' if empty).
    """
    if not value:
        return "default"
    raw_str = str(value).replace("\x00", "")
    sanitized = re.sub(r"[^a-zA-Z0-9._-]", "", raw_str).lstrip("-.")
    return sanitized or "default"


class CommandExecutionError(Exception):
    """Raised when a subprocess fails to run or returns a non-zero exit code."""

    def __init__(
        self, cmd: str | list[str], returncode: int, stdout: str, stderr: str
    ) -> None:
        """Initializes the error with command results."""
        cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
        super().__init__(f"Command '{cmd_str}' failed with exit code {returncode}")
        self.cmd = cmd_str
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class CommandExecutor:
    """Utility class to execute system-level commands and handle failures."""

    @staticmethod
    def run(
        cmd: str | list[str],
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        timeout: float = 3600.0,
    ) -> str:
        """Executes a command safely using direct argument lists without shell invocation.

        Args:
            cmd: The command string or list of argument tokens to execute.
            cwd: The directory path in which to run the command. Defaults to CWD.
            env: Custom environment variable dictionary to pass to the process.
            timeout: Maximum allowed duration in seconds. Defaults to 3600.0s.

        Returns:
            The trimmed stdout string from the command process.

        Raises:
            CommandExecutionError: If the process exits with a non-zero status.
        """
        active_cwd = cwd or os.getcwd()
        exec_env = os.environ.copy()
        exec_env.setdefault("GEMINI_CLI_TRUST_WORKSPACE", "true")
        exec_env.setdefault("GEMINI_CLI_WORKSPACE_TRUSTED", "true")
        if env:
            exec_env.update(env)

        # Convert string commands into argument tokens, parsing inline KEY=VAL env prefixes
        if isinstance(cmd, str):
            tokens = shlex.split(cmd)
            args: list[str] = []
            for token in tokens:
                if "=" in token and not args:
                    k, v = token.split("=", 1)
                    exec_env[k] = v
                else:
                    args.append(token)
        else:
            args = list(cmd)

        if not args:
            logger.error("Command execution failed: no executable command provided after parsing tokens.")
            raise CommandExecutionError(
                cmd=cmd,
                returncode=-1,
                stdout="",
                stderr="No executable command specified to run.",
            )

        cmd_str = " ".join(args)
        logger.info("Executing command: %s (CWD: %s)", cmd_str, active_cwd)

        try:
            result = subprocess.run(
                args,
                cwd=active_cwd,
                env=exec_env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )

            stdout_str = result.stdout.strip() if result.stdout else ""
            stderr_str = result.stderr.strip() if result.stderr else ""

            if result.returncode != 0:
                logger.error(
                    "Command execution failed: %s (Exit Code: %s)",
                    cmd_str,
                    result.returncode,
                )
                if stdout_str:
                    logger.error("Stdout:\n%s", stdout_str)
                if stderr_str:
                    logger.error("Stderr:\n%s", stderr_str)
                raise CommandExecutionError(
                    cmd=args,
                    returncode=result.returncode,
                    stdout=stdout_str,
                    stderr=stderr_str,
                )

            return stdout_str
        except Exception as e:
            if not isinstance(e, CommandExecutionError):
                logging.exception(
                    "An unexpected error occurred during command execution: %s",
                    cmd_str,
                )
            raise
