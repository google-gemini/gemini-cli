"""Configuration module for the SSR Agent Orchestrator.

This module parses, validates, and holds all configuration parameters and path
constants needed by the orchestrator. It ensures fast-fail on missing or invalid
configurations.
"""

import json
import os
from typing import Any


class ConfigurationError(Exception):
    """Raised when configuration loading or validation fails."""


class Config:
    """Manages environmental inputs, paths, and limits for the orchestrator."""

    def __init__(self) -> None:
        """Initializes the configuration with environment variables and defaults."""
        # Target repository configuration
        self.repo_url: str = os.environ.get(
            "REPO_URL", "https://github.com/joneba-google/gemini-cli-clone"
        )
        self.git_token: str | None = os.environ.get("GIT_TOKEN")
        self.firestore_doc_raw: str | None = os.environ.get("FIRESTORE_DOC")
        self.firestore_id: str | None = (
            os.environ.get("FIRESTORE_ID") or os.environ.get("firestore_id")
        )
        self.execution_id: str | None = os.environ.get("EXECUTION_ID")

        # Google Cloud Platform configuration
        self.project_id: str = os.environ.get(
            "GOOGLE_CLOUD_PROJECT", "gcli-intern-project-2026"
        )
        self.location: str = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
        self.model_name: str = os.environ.get("MODEL_NAME", "gemini-3.5-flash")

        # Global runtime settings
        self.max_attempts: int = int(os.environ.get("MAX_ATTEMPTS", "5"))

        # Workspace directory configuration
        self.tmp_dir: str = "/tmp"
        self.pr_dir: str = os.path.join(self.tmp_dir, "pr")
        self.eval_dir: str = os.path.join(self.tmp_dir, "eval")

        self.repo_name: str = (
            self.repo_url.rstrip("/").split("/")[-1].replace(".git", "")
        )
        self.pr_repo_path: str = os.path.join(self.pr_dir, self.repo_name)
        self.eval_repo_path: str = os.path.join(self.eval_dir, self.repo_name)

        # Global environment variables to trust the CLI
        os.environ["GEMINI_CLI_WORKSPACE_TRUSTED"] = "true"
        os.environ["GEMINI_CLI_TRUST_WORKSPACE"] = "true"

    def load_and_validate_firestore_doc(self) -> dict[str, Any]:
        """Parses and validates the Firestore JSON input specification.

        Returns:
            The decoded dictionary of the Firestore document.

        Raises:
            ConfigurationError: If the document is missing or not valid JSON.
        """
        if not self.firestore_doc_raw:
            raise ConfigurationError(
                "Environment variable 'FIRESTORE_DOC' is required but was not set."
            )
        try:
            doc_data = json.loads(self.firestore_doc_raw)
            if not isinstance(doc_data, dict):
                raise ConfigurationError(
                    "Firestore document specification must be a JSON object."
                )
            return doc_data
        except json.JSONDecodeError as e:
            raise ConfigurationError(
                f"Failed to parse 'FIRESTORE_DOC' as JSON: {e}"
            ) from e
