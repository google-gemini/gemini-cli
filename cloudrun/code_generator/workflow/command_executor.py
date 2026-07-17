"""Command execution module for running system sub-processes.

Provides safe, well-logged shell execution utilities to prevent process-level leaks
and capture standard output/error cleanly.
"""

import logging
import os
import subprocess


class CommandExecutionError(Exception):
    """Raised when a subprocess fails to run or returns a non-zero exit code."""

    def __init__(self, cmd: str, returncode: int, stdout: str, stderr: str) -> None:
        """Initializes the error with command results."""
        super().__init__(f"Command '{cmd}' failed with exit code {returncode}")
        self.cmd = cmd
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class CommandExecutor:
    """Utility class to execute system-level commands and handle failures."""

    @staticmethod
    def run(cmd: str, cwd: str | None = None, env: dict[str, str] | None = None) -> str:
        """Executes a system shell command, capturing output and errors.

        Args:
            cmd: The shell command to execute.
            cwd: The directory path in which to run the command. Defaults to CWD.
            env: Custom environment variable dictionary to pass to the process.

        Returns:
            The trimmed stdout string from the command process.

        Raises:
            CommandExecutionError: If the process exits with a non-zero status.
        """
        active_cwd = cwd or os.getcwd()
        logging.info("Executing command: %s (CWD: %s)", cmd, active_cwd)

        # We pass shell=True because the commands execute node environment variables,
        # conditional commands, pipelines, and glob expansions. This runs inside a trusted
        # internal container.
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                check=False
            )
            
            stdout_str = result.stdout.strip() if result.stdout else ""
            stderr_str = result.stderr.strip() if result.stderr else ""

            if result.returncode != 0:
                logging.error("Command execution failed: %s (Exit Code: %s)", cmd, result.returncode)
                logging.error("Stdout:\n%s", stdout_str)
                logging.error("Stderr:\n%s", stderr_str)
                raise CommandExecutionError(
                    cmd=cmd,
                    returncode=result.returncode,
                    stdout=stdout_str,
                    stderr=stderr_str
                )

            return stdout_str
        except Exception as e:
            if not isinstance(e, CommandExecutionError):
                logging.exception("An unexpected error occurred during command execution: %s", cmd)
            raise
