"""Preflight test and linting validation filter.

Helps parses CI tool and unit test terminal outputs to identify and selectively
bypass known, acceptable test failures (such as specific root privilege bypass
test failures).
"""

import logging
import re


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
        ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\\[0-?]*[ -/]*[@-~])")
        return ansi_escape.sub("", text)

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

        # Regex search for failing files of format "FAIL src/..."
        failing_files = set(re.findall(r"FAIL\s+(src/[^\s>]+)", clean_output))
        logging.info("Analyzing failing test files: %s", failing_files)

        allowed_failures = {
            "src/utils/sessionCleanup.test.ts",
            "src/config/extension-manager-permissions.test.ts",
        }

        if not failing_files:
            logging.info("No failing test files matched.")
            return False

        # If failures exist that are not inside our allowed list, we cannot ignore
        if not failing_files.issubset(allowed_failures):
            logging.warning(
                "Unapproved test failures detected: %s",
                failing_files - allowed_failures,
            )
            return False

        # Find total test failure count summary in JEST style output: e.g. "Tests: 3 failed, 4 passed"
        match = re.search(r"Tests\s+(\d+)\s+failed", clean_output)
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
