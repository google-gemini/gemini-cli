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

"""GitHub REST API Client module.

Handles GitHub pull request creation and branch push operations cleanly using
standard urllib to minimize container dependency footprint.
"""

import json
import logging
import random
import time
import urllib.error
import urllib.request

logger = logging.getLogger("Orchestrator")


class GitHubClientError(Exception):
    """Raised when a GitHub API request fails or is rejected."""


class GitHubClient:
    """Lightweight client for communicating with the GitHub v3 REST API."""

    def __init__(self, owner: str, repo: str, token: str | None = None) -> None:
        """Initializes the GitHub REST Client.

        Args:
            owner: Owner/organization of the repository.
            repo: Name of the repository.
            token: Authentication token. If missing, API calls will fail.
        """
        self.owner = owner
        self.repo = repo
        self._token = token
        self._base_url = f"https://api.github.com/repos/{owner}/{repo}/pulls"

    def create_pull_request(
        self, branch_name: str, title: str, body: str
    ) -> str:
        """Submits a POST request to GitHub to create a new Pull Request.

        Args:
            branch_name: The feature branch to be merged.
            title: Title of the Pull Request.
            body: Body description markdown of the Pull Request.

        Returns:
            The PR number of the successfully created Pull Request as a string.

        Raises:
            GitHubClientError: If the HTTP request fails or token is missing.
        """
        if not self._token:
            raise GitHubClientError(
                "GitHub token is missing. Cannot authorize Pull Request creation."
            )

        data = {
            "title": title,
            "body": body,
            "head": branch_name,
            "base": "main",
        }

        req = urllib.request.Request(
            self._base_url,
            data=json.dumps(data).encode("utf-8"),
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self._token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        logger.info(
            "Sending Pull Request creation request for branch: %s", branch_name
        )
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                with urllib.request.urlopen(req, timeout=60) as response:
                    response_payload = json.loads(response.read().decode("utf-8"))
                    pr_number: str = str(response_payload.get("number", response_payload.get("html_url", "")))
                    logger.info(
                        "Pull Request created successfully! PR Number: %s", pr_number
                    )
                    return pr_number
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8") if e.fp else "No body content"
                err_msg = f"HTTP {e.code}: {err_body}"

                # Transient rate limit or server error: retry with backoff
                if e.code in [429, 500, 502, 503, 504] and attempt < max_attempts:
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    if retry_after and retry_after.isdigit():
                        backoff = min(float(retry_after), 60.0)
                    else:
                        backoff = min((2 ** (attempt - 1)) + random.uniform(0.1, 0.5), 60.0)
                    logger.warning(
                        "Transient error (%s) on attempt %s/%s. Retrying in %.2fs...",
                        err_msg, attempt, max_attempts, backoff
                    )
                    time.sleep(backoff)
                    continue

                logger.error("Failed to create Pull Request: %s", err_msg)
                raise GitHubClientError(f"GitHub API Error: {err_msg}") from e

            except urllib.error.URLError as e:
                err_msg = f"Network Error: {getattr(e, 'reason', e)}"
                if attempt < max_attempts:
                    backoff = min((2 ** (attempt - 1)) + random.uniform(0.1, 0.5), 60.0)
                    logger.warning(
                        "Network error (%s) on attempt %s/%s. Retrying in %.2fs...",
                        err_msg, attempt, max_attempts, backoff
                    )
                    time.sleep(backoff)
                    continue

                logger.error("Failed to create Pull Request: %s", err_msg)
                raise GitHubClientError(f"GitHub API Error: {err_msg}") from e

            except Exception as e:
                logger.exception("Encountered unexpected error during PR creation.")
                raise GitHubClientError(
                    f"Unexpected API client error: {e}"
                ) from e
