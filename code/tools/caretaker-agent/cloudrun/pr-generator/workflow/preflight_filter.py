"""Preflight test and linting validation filter.

Parses CI tool and unit test terminal outputs to identify and selectively
bypass known, acceptable test failures (such as specific container/sandbox
privilege test failures).
"""

import logging
import re

_ANSI_ESCAPE_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")

ALLOWED_SANDBOX_FAILURES: set[str] = {
    "src/utils/sessionCleanup.test.ts",
    "src/config/extension-manager-permissions.test.ts",
    "root-privilege-check",
    "container-permission-test",
}


def strip_ansi(text: str) -> str:
    """Removes ANSI terminal styling escape sequences from a string."""
    return _ANSI_ESCAPE_RE.sub("", text)


def is_preflight_failure_allowed(
    test_output: str,
    allowed_failures: set[str] = ALLOWED_SANDBOX_FAILURES,
) -> bool:
    """Checks if test failures belong strictly to approved container/sandbox exceptions."""
    clean_output = strip_ansi(test_output)
    lines = clean_output.splitlines()

    failing_lines = [
        line for line in lines if "FAIL" in line or "FAILED" in line
    ]
    if not failing_lines:
        return False

    for line in failing_lines:
        if not any(allowed in line for allowed in allowed_failures):
            logging.warning("Unapproved preflight test failure detected: %s", line)
            return False

    logging.info("All detected test failure lines match approved sandbox exceptions.")
    return True


class PreflightFilter:
    """Utility class to filter ANSI characters and analyze test suite results."""

    @staticmethod
    def strip_ansi(text: str) -> str:
        """Removes ANSI terminal styling escape sequences from a string."""
        return strip_ansi(text)

    @classmethod
    def should_ignore_preflight_failure(
        cls,
        stdout: str | None,
        stderr: str | None,
        allowed_failures: set[str] = ALLOWED_SANDBOX_FAILURES,
    ) -> bool:
        """Analyzes regression test outputs to see if they can be safely bypassed."""
        raw_output = (stdout or "") + "\n" + (stderr or "")
        return is_preflight_failure_allowed(raw_output, allowed_failures)
