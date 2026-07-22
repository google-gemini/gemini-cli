"""Command execution and input sanitization module.

Provides safe subprocess execution utilities, path traversal guards,
and input sanitizers to prevent injection attacks and capture process output cleanly.
"""

import logging
import os
import re
import subprocess


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
    raw_str = str(path).replace("\x00", "").strip()
    if not raw_str:
        return None
    clean_path = os.path.normpath(raw_str)
    if clean_path.startswith("..") or os.path.isabs(clean_path):
        logging.warning("Path traversal attempt or absolute path detected: %s", path)
        return None
    return clean_path


def sanitize_identifier(value: str) -> str:
    """Sanitizes an untrusted string for use in branch names, tags, or CLI identifiers.

    Strips null bytes and removes any character not in [a-zA-Z0-9._-].

    Args:
        value: Untrusted identifier string.

    Returns:
        A sanitized alphanumeric identifier string (defaults to 'default' if empty).
    """
    if not value:
        return "default"
    raw_str = str(value).replace("\x00", "")
    sanitized = re.sub(r"[^a-zA-Z0-9._-]", "", raw_str)
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
    ) -> str:
        """Executes a system command or shell pipeline, capturing output and errors.

        Args:
            cmd: The shell command string or list of argument tokens to execute.
            cwd: The directory path in which to run the command. Defaults to CWD.
            env: Custom environment variable dictionary to pass to the process.

        Returns:
            The trimmed stdout string from the command process.

        Raises:
            CommandExecutionError: If the process exits with a non-zero status.
        """
        active_cwd = cwd or os.getcwd()
        cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
        logging.info("Executing command: %s (CWD: %s)", cmd_str, active_cwd)

        use_shell = isinstance(cmd, str)
        try:
            result = subprocess.run(
                cmd,
                shell=use_shell,
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            stdout_str = result.stdout.strip() if result.stdout else ""
            stderr_str = result.stderr.strip() if result.stderr else ""

            if result.returncode != 0:
                logging.error(
                    "Command execution failed: %s (Exit Code: %s)",
                    cmd_str,
                    result.returncode,
                )
                logging.error("Stdout:\n%s", stdout_str)
                logging.error("Stderr:\n%s", stderr_str)
                raise CommandExecutionError(
                    cmd=cmd,
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
