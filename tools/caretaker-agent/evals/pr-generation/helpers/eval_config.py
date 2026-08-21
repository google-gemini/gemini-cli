# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Evaluation Configuration Subclass.

Extends standard Config to support isolated workspace directories per test case
and dynamic target repository resolution from github_metadata.
"""
import os
import sys
from dataclasses import dataclass
from typing import List

from workflow.config import Config


@dataclass(frozen=True)
class TriageBatchConfig:
    """Immutable runtime configuration for batch triage agent evaluation."""

    issues: List[int]
    owner: str = "google-gemini"
    repo: str = "gemini-cli"
    concurrency: int = 4
    gcs_sync: bool = False
    keep_worktrees: bool = False
    verbose: bool = False


class EvalConfig(Config):
    """Custom configuration for local evaluation suite runs."""

    def __init__(self, workspace_root: str, firestore_doc_dict: dict) -> None:
        """Initializes configuration scoped to a specific test workspace.

        Args:
            workspace_root: Directory path for this test case's agent environment.
            firestore_doc_dict: Pre-parsed dictionary representing the Firestore spec.
        """
        super().__init__()
        self.firestore_doc_dict = firestore_doc_dict if isinstance(firestore_doc_dict, dict) else {}
        os.environ.setdefault("DISABLE_GCS_LOGGING", "true")

        # Defensively target repository metadata, preventing AttributeError on null/malformed JSON
        raw_meta = self.firestore_doc_dict.get("github_metadata")
        github_meta = raw_meta if isinstance(raw_meta, dict) else {}
        owner = github_meta.get("owner")
        repo = github_meta.get("repo")
        if owner and repo:
            import re
            owner_sanitized = re.sub(r"[^a-zA-Z0-9._-]", "", str(owner)).strip(".") or "default"
            repo_sanitized = re.sub(r"[^a-zA-Z0-9._-]", "", str(repo)).strip(".") or "default"
            self.repo_url = f"https://github.com/{owner_sanitized}/{repo_sanitized}"
            self.repo_name = repo_sanitized
        else:
            self.repo_url = os.environ.get(
                "REPO_URL", "https://github.com/joneba-google/gemini-cli-clone"
            )
            raw_repo_name = (
                self.repo_url.rstrip("/").split("/")[-1].replace(".git", "")
            )
            import re
            self.repo_name = re.sub(r"[^a-zA-Z0-9._-]", "", raw_repo_name).strip(".") or "default"

        # Ensure absolute pathing to survive process working directory transitions
        abs_root = os.path.abspath(workspace_root)
        self.tmp_dir = os.path.join(abs_root, "tmp")
        self.pr_dir = os.path.join(self.tmp_dir, "pr")
        self.eval_dir = os.path.join(self.tmp_dir, "eval")

        self.pr_repo_path = os.path.join(self.pr_dir, self.repo_name)
        self.eval_repo_path = os.path.join(self.eval_dir, self.repo_name)

        # Execution identifier
        self.execution_id = os.environ.get("EXECUTION_ID", "local-eval-execution")

    def load_and_validate_firestore_doc(self) -> dict:
        """Returns the pre-loaded Firestore dictionary directly."""
        return self.firestore_doc_dict
