# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/config.py."""

import json
import os
import pytest

from config import Config, ConfigurationError


def test_config_defaults(monkeypatch):
    """Tests default configuration fallback values when environment variables are unset."""
    monkeypatch.delenv("REPO_URL", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_LOCATION", raising=False)
    monkeypatch.delenv("MODEL_NAME", raising=False)
    monkeypatch.delenv("MAX_ATTEMPTS", raising=False)

    cfg = Config()
    assert cfg.repo_url == "https://github.com/joneba-google/gemini-cli-clone"
    assert cfg.project_id == "gcli-intern-project-2026"
    assert cfg.location == "global"
    assert cfg.model_name == "gemini-3.5-flash"
    assert cfg.max_attempts == 5
    assert cfg.repo_name == "gemini-cli-clone"


def test_config_max_attempts_valid(monkeypatch):
    """Tests custom MAX_ATTEMPTS environment variable parsing."""
    monkeypatch.setenv("MAX_ATTEMPTS", "12")
    cfg = Config()
    assert cfg.max_attempts == 12


def test_config_max_attempts_invalid_string(monkeypatch):
    """Tests that invalid MAX_ATTEMPTS strings fall back cleanly to 5."""
    monkeypatch.setenv("MAX_ATTEMPTS", "invalid_string")
    cfg = Config()
    assert cfg.max_attempts == 5


def test_config_max_attempts_zero_or_negative(monkeypatch):
    """Tests lower bound enforcement (max(val, 1)) for zero or negative values."""
    monkeypatch.setenv("MAX_ATTEMPTS", "0")
    cfg1 = Config()
    assert cfg1.max_attempts == 1

    monkeypatch.setenv("MAX_ATTEMPTS", "-5")
    cfg2 = Config()
    assert cfg2.max_attempts == 1


def test_config_repo_name_derivation(monkeypatch):
    """Tests repository name parsing from REPO_URL with trailing slashes and .git suffixes."""
    monkeypatch.setenv("REPO_URL", "https://github.com/my-org/my-custom-repo.git/")
    cfg = Config()
    assert cfg.repo_name == "my-custom-repo"
    assert cfg.pr_repo_path == os.path.join("/tmp/pr", "my-custom-repo")
    assert cfg.eval_repo_path == os.path.join("/tmp/eval", "my-custom-repo")


def test_load_and_validate_firestore_doc_valid(monkeypatch):
    """Tests loading and validating a valid JSON FIRESTORE_DOC string."""
    valid_doc = {"workable_spec": {"issue_id": "190"}, "status": "PENDING"}
    monkeypatch.setenv("FIRESTORE_DOC", json.dumps(valid_doc))

    cfg = Config()
    parsed = cfg.load_and_validate_firestore_doc()
    assert parsed["workable_spec"]["issue_id"] == "190"
    assert parsed["status"] == "PENDING"


def test_load_and_validate_firestore_doc_missing(monkeypatch):
    """Tests error handling when FIRESTORE_DOC environment variable is missing."""
    monkeypatch.delenv("FIRESTORE_DOC", raising=False)
    cfg = Config()
    with pytest.raises(ConfigurationError) as exc_info:
        cfg.load_and_validate_firestore_doc()
    assert "Environment variable 'FIRESTORE_DOC' is required" in str(exc_info.value)


def test_load_and_validate_firestore_doc_invalid_json(monkeypatch):
    """Tests error handling when FIRESTORE_DOC is not valid JSON."""
    monkeypatch.setenv("FIRESTORE_DOC", "{invalid json string")
    cfg = Config()
    with pytest.raises(ConfigurationError) as exc_info:
        cfg.load_and_validate_firestore_doc()
    assert "Failed to parse 'FIRESTORE_DOC' as JSON" in str(exc_info.value)


def test_load_and_validate_firestore_doc_non_dict(monkeypatch):
    """Tests error handling when FIRESTORE_DOC parses to a non-dict JSON structure."""
    monkeypatch.setenv("FIRESTORE_DOC", '["array_item1", "array_item2"]')
    cfg = Config()
    with pytest.raises(ConfigurationError) as exc_info:
        cfg.load_and_validate_firestore_doc()
    assert "Firestore document specification must be a JSON object" in str(exc_info.value)
