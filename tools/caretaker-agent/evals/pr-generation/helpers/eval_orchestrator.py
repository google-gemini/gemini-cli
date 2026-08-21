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

"""Evaluation Orchestrator Subclass.

Bypasses Firestore locking and GitHub PR submission for local evaluation runs.
"""

import json
import logging
import os
import re
import sys

from workflow.orchestrator import Orchestrator, OrchestrationError
from workflow.command_executor import CommandExecutor

logger = logging.getLogger("Orchestrator")


class EvalOrchestrator(Orchestrator):
    """Subclass of Orchestrator adapted for offline evaluation runs."""

    def __init__(self, config) -> None:
        super().__init__(config)
        self.generated_diff: str | None = None
        self.pr_details_content: str | None = None

    def _sync_or_clone_repository(self) -> None:
        """Clones or syncs target repository and checks out target_version SHA if present."""
        firestore_doc = self.config.load_and_validate_firestore_doc()
        github_meta = firestore_doc.get("github_metadata", {})
        target_version = github_meta.get("target_version")
        issue_num = github_meta.get("issue_number", "0")
        branch_name = f"eval-agent-issue-{issue_num}"

        if not os.path.exists(self.config.pr_repo_path):
            logger.info("Cloning repository %s to %s", self.config.repo_url, self.config.pr_repo_path)
            CommandExecutor.run(["git", "clone", self.config.repo_url, self.config.pr_repo_path])

        if target_version:
            logger.info("Checking out specified target_version commit SHA: %s", target_version)
            try:
                CommandExecutor.run(["git", "fetch", "origin"], self.config.pr_repo_path)
                CommandExecutor.run(["git", "checkout", "-B", branch_name, target_version], self.config.pr_repo_path)
                self.base_ref = target_version
            except Exception as e:
                logger.warning("Failed to checkout target_version SHA %s, falling back to main: %s", target_version, e)
                CommandExecutor.run(["git", "checkout", "-B", branch_name, "origin/main"], self.config.pr_repo_path)
                self.base_ref = "origin/main"
        else:
            logger.info("No target_version commit SHA specified. Checking out origin/main baseline.")
            CommandExecutor.run(["git", "checkout", "-B", branch_name, "origin/main"], self.config.pr_repo_path)
            self.base_ref = "origin/main"

        # Ignore agent/orch file writes to prevent pollution of git status in evaluation workspace
        exclude_file = os.path.join(self.config.pr_repo_path, ".git", "info", "exclude")
        try:
            os.makedirs(os.path.dirname(exclude_file), exist_ok=True)
            with open(exclude_file, "a", encoding="utf-8") as f:
                f.write(
                    "\nfirestore_doc.json\npr_feedback.md\nfeedback.md\n"
                    "changes.diff\nverdict.json\npr_details.md\nlinter_output.txt\n"
                )
        except Exception as io_err:
            logger.debug("Failed to configure git exclude file in eval repo: %s", io_err)

    async def run(self) -> dict:
        """Executes orchestration pipeline locally without GCP or GitHub calls.

        Returns:
            Dictionary containing evaluation status, diff content, and pr_details.
        """
        self._setup_workspace()
        firestore_doc = self.config.load_and_validate_firestore_doc()

        issue_id = firestore_doc.get("workable_spec", {}).get("issue_id", "unknown")
        github_metadata = firestore_doc.get("github_metadata", {})
        issue_num = github_metadata.get("issue_number", 0)
        repo_slug = github_metadata.get("repository", "google-gemini/gemini-cli")
        if "/" in repo_slug:
            owner, repo = repo_slug.split("/", 1)
        else:
            owner, repo = "google-gemini", repo_slug

        branch_name = f"eval-agent-issue-{issue_num}"

        # 1. Sync / Clone target repository locally
        self._sync_or_clone_repository()
        
        # 2. Persist firestore_doc.json into PR repo workspace
        spec_pr_path = os.path.join(self.config.pr_repo_path, "firestore_doc.json")
        try:
            with open(spec_pr_path, "w", encoding="utf-8") as f:
                json.dump(firestore_doc, f, indent=2)
        except IOError as e:
            raise OrchestrationError(f"Failed to save firestore_doc.json to workspace: {e}") from e

        # Install NPM packages inside PR workspace if node_modules is missing
        node_modules_path = os.path.join(self.config.pr_repo_path, "node_modules")
        if not os.path.exists(node_modules_path):
            logger.info("Installing node dependencies inside PR repository workspace...")
            try:
                npm_env = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=4096"}
                CommandExecutor.run(
                    ["npm", "ci", "--no-audit", "--no-fund", "--maxsockets", "3"],
                    self.config.pr_repo_path,
                    env=npm_env,
                )
            except Exception as e:
                raise OrchestrationError(f"Failed to install NPM dependencies in PR workspace: {e}") from e

        approved = False
        loop_count = 0
        verdict = "NEEDS_REVISION"
        commit_line_count = 0

        while loop_count < self.config.max_attempts and not approved:
            loop_count += 1
            commit_line_count = 0
            logger.info("=== [LOCAL EVAL] Starting Iteration %s/%s ===", loop_count, self.config.max_attempts)

            # Phase 1: Code Generation
            await self._run_code_generation(loop_count, owner=owner, repo=repo, issue_num=issue_num)

            # Stage edits and generate diff
            diff_content = self._prepare_iteration_commit(issue_num, loop_count, owner=owner, repo=repo)
            if not diff_content:
                logger.info("[LOCAL EVAL] No code modifications detected in iteration %s.", loop_count)
                continue
            self.generated_diff = diff_content

            # Phase 2: Evaluation
            verdict = await self._run_evaluation(diff_content, firestore_doc, owner=owner, repo=repo, issue_num=issue_num)

            if verdict in ["APPROVED", "PASS"]:
                logger.info("[LOCAL EVAL] Patch approved by Evaluator. Running regression checks...")
                approved = await self._run_regression_checks()

                if approved:
                    try:
                        diff_stat = CommandExecutor.run(["git", "diff", "--stat", self.base_ref], self.config.pr_repo_path)
                        logger.info("Diff Stat summary:\n%s", diff_stat)
                        lines = diff_stat.strip().split("\n")
                        last_line = lines[-1] if lines else ""
                        insertions = re.search(r"(\d+)\s+insertion", last_line)
                        deletions = re.search(r"(\d+)\s+deletion", last_line)
                        if insertions:
                            commit_line_count += int(insertions.group(1))
                        if deletions:
                            commit_line_count += int(deletions.group(1))
                    except Exception as e:
                        logger.warning("Failed to parse modifications line count: %s", e)

            if not approved:
                self._save_feedback_to_coding_workspace()

        # Extract pr_details.md if generated
        pr_details_path = os.path.join(self.config.eval_repo_path, "pr_details.md")
        if os.path.exists(pr_details_path):
            try:
                with open(pr_details_path, "r", encoding="utf-8") as f:
                    self.pr_details_content = f.read()
            except IOError:
                pass

        if approved:
            if commit_line_count > 500:
                logger.error("[LOCAL EVAL] Approved but modifications (%s lines) exceed 500 limit.", commit_line_count)
                return {
                    "success": False,
                    "status": "EXCEEDED_LINE_LIMIT",
                    "diff": self.generated_diff,
                    "line_count": commit_line_count,
                    "pr_details": self.pr_details_content,
                    "error": f"Commit modifications ({commit_line_count} lines) exceed 500 lines limit.",
                    "attempts": loop_count,
                    "max_attempts": self.config.max_attempts,
                }
            logger.info("=== [LOCAL EVAL] SUCCESS: Patch Approved and Verified ===")
            return {
                "success": True,
                "status": "APPROVED",
                "diff": self.generated_diff,
                "pr_details": self.pr_details_content,
                "error": None,
                "attempts": loop_count,
                "max_attempts": self.config.max_attempts,
            }
        else:
            logger.error("=== [LOCAL EVAL] FAILED: Exceeded Max Attempts without Approval ===")
            return {
                "success": False,
                "status": "REJECTED",
                "diff": self.generated_diff,
                "pr_details": None,
                "error": f"Failed to reach approval after {self.config.max_attempts} iterations.",
                "attempts": loop_count,
                "max_attempts": self.config.max_attempts,
            }
