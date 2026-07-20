"""GitHub REST API Client module.

Handles GitHub pull request creation and branch push operations cleanly using
standard urllib to minimize container dependency footprint.
"""

import json
import logging
import urllib.error
import urllib.request


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
            The HTML URL of the successfully created Pull Request.

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

        logging.info(
            "Sending Pull Request creation request for branch: %s", branch_name
        )
        try:
            with urllib.request.urlopen(req,timeout=60) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
                pr_url: str = response_payload.get("html_url", "")
                logging.info(
                    "Pull Request created successfully! URL: %s", pr_url
                )
                return pr_url
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else "No body content"
            logging.error(
                "Failed to create Pull Request. HTTP %s: %s",
                e.code,
                err_body
            )
            raise GitHubClientError(
                f"GitHub API Error (HTTP {e.code}): {err_body}"
            ) from e
        except Exception as e:
            logging.exception("Encountered unexpected error during PR creation.")
            raise GitHubClientError(
                f"Unexpected API client error: {e}"
            ) from e
