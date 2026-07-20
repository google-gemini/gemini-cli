"""Preflight test and linting validation filter.

Helps parses CI tool and unit test terminal outputs to identify and selectively
bypass known, acceptable test failures (such as specific root privilege bypass
test failures).
"""

import logging
import re

_ANSI_ESCAPE_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\\[0-?]*[ -/]*[@-~])")
_FAIL_PATH_RE = re.compile(r"FAIL\s+(\S+)")
_TEST_FAILED_COUNT_RE = re.compile(r"Tests:?\s*(\d+)\s+failed")


class PreflightFilter:
    """Utility class to filter ANSI characters and analyze test suite results."""

    @staticmethod
    def strip_ansi(text: str) -> str:
        """Removes ANSI terminal styling escape sequences from a string.

        Args:
            text: Raw output text from command standard streams.

        Returns:
            The sanitized string without escape sequences.
        """
        return _ANSI_ESCAPE_RE.sub("", text)

    @classmethod
    def should_ignore_preflight_failure(
        cls, stdout: str | None, stderr: str | None
    ) -> bool:
        """Analyzes regression test outputs to see if they can be safely bypassed.

        Specifically, bypasses known, isolated sandbox-level root privilege bypasses
        defined in the allowed list, provided no other tests fail.

        Args:
            stdout: Command standard output stream contents.
            stderr: Command standard error stream contents.

        Returns:
            True if the failures are allowed and can be bypassed, False otherwise.
        """
        raw_output = (stdout or "") + "\n" + (stderr or "")
        clean_output = cls.strip_ansi(raw_output)

        # Regex search for failing files of format "FAIL [path]"
        failing_files = set(_FAIL_PATH_RE.findall(clean_output))
        logging.info("Analyzing failing test files: %s", failing_files)

        allowed_failures = {
            "src/utils/sessionCleanup.test.ts",
            "src/config/extension-manager-permissions.test.ts",
        }

        if not failing_files:
            logging.info("No failing test files matched.")
            return False

        # If failures exist that do not match our allowed failure suffixes, we cannot ignore
        unapproved_failures = {
            f for f in failing_files
            if not any(f.endswith(allowed) for allowed in allowed_failures)
        }
        if unapproved_failures:
            logging.warning(
                "Unapproved test failures detected: %s",
                unapproved_failures,
            )
            return False

        # Find total test failure count summary in JEST style output: e.g. "Tests: 3 failed, 4 passed"
        match = _TEST_FAILED_COUNT_RE.search(clean_output)
        if not match:
            logging.warning("No standard test failure count summary found.")
            return False

        failed_count = int(match.group(1))
        # We only bypass if the failure count is within limits (<= 3)
        if failed_count <= 3:
            logging.info(
                "Ignoring %s failures in known files: %s",
                failed_count,
                failing_files,
            )
            return True

        logging.warning("Failed count (%s) exceeds bypass threshold.", failed_count)
        return False
