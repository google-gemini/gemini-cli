# Copyright 2026 Google LLC
# Apache-2.0 License

"""Shared Pytest Fixtures for Workflow Module Tests."""

import os
import sys
import pytest

# Ensure workflow directory is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WORKFLOW_DIR = os.path.join(BASE_DIR, "workflow")
if WORKFLOW_DIR not in sys.path:
    sys.path.insert(0, WORKFLOW_DIR)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    """Ensures environment variables are clean and isolated for each test."""
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project-2026")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    monkeypatch.setenv("MODEL_NAME", "gemini-3.5-flash")
    monkeypatch.setenv("MAX_ATTEMPTS", "5")
    monkeypatch.setenv("REPO_URL", "https://github.com/test-owner/test-repo.git")
    monkeypatch.setenv("GIT_TOKEN", "test-github-token-12345")
    yield
