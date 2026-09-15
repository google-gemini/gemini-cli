# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/preflight_filter.py."""

from preflight_filter import (
    ALLOWED_SANDBOX_FAILURES,
    PreflightFilter,
    is_preflight_failure_allowed,
    strip_ansi,
)


def test_strip_ansi_color_codes():
    """Tests that strip_ansi cleanly removes ANSI terminal escape codes."""
    colored_text = "\x1b[31mFAIL\x1b[0m \x1b[1msrc/utils/test.ts\x1b[0m"
    assert strip_ansi(colored_text) == "FAIL src/utils/test.ts"
    assert PreflightFilter.strip_ansi(colored_text) == "FAIL src/utils/test.ts"


def test_is_preflight_failure_allowed_single_approved_file():
    """Tests approval of a single known allowed test file failure."""
    output = "FAIL src/utils/sessionCleanup.test.ts"
    assert is_preflight_failure_allowed(output) is True


def test_is_preflight_failure_allowed_multiple_approved_files():
    """Tests approval when multiple known allowed test files fail."""
    output = (
        "FAIL src/utils/sessionCleanup.test.ts\n"
        "FAIL src/config/extension-manager-permissions.test.ts"
    )
    assert is_preflight_failure_allowed(output) is True


def test_is_preflight_failure_allowed_generic_keyword():
    """Tests approval when failure matches generic container/sandbox exception keywords."""
    output = "FAILED root-privilege-check in sandbox"
    assert is_preflight_failure_allowed(output) is True


def test_is_preflight_failure_allowed_unapproved_failure():
    """Tests rejection when an unapproved test file fails."""
    output = (
        "FAIL src/utils/sessionCleanup.test.ts\n"
        "FAIL src/auth/loginService.test.ts"
    )
    assert is_preflight_failure_allowed(output) is False


def test_is_preflight_failure_allowed_no_failures():
    """Tests that output with no 'FAIL' or 'FAILED' lines returns False."""
    output = "PASS src/utils/sessionCleanup.test.ts\nTests: 12 passed, 12 total"
    assert is_preflight_failure_allowed(output) is False


def test_should_ignore_preflight_failure_concatenates_streams():
    """Tests PreflightFilter.should_ignore_preflight_failure stream concatenation."""
    stdout = "FAIL src/utils/sessionCleanup.test.ts"
    stderr = ""
    assert PreflightFilter.should_ignore_preflight_failure(stdout, stderr) is True

    unapproved_stdout = "FAIL src/core/main.test.ts"
    assert PreflightFilter.should_ignore_preflight_failure(unapproved_stdout, stderr) is False
