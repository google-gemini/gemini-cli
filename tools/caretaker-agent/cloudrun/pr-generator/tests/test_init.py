# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/__init__.py."""

import workflow


def test_package_docstring():
    """Tests that the workflow package contains a valid docstring."""
    assert workflow.__doc__ is not None
    assert "GCLI Orchestrator Package" in workflow.__doc__
