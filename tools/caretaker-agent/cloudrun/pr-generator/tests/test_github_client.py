# Copyright 2026 Google LLC
# Apache-2.0 License

"""Unit tests for workflow/github_client.py."""

import io
import json
import urllib.error
from unittest.mock import MagicMock, patch

import pytest
from github_client import GitHubClient, GitHubClientError


def test_github_client_init():
    """Tests GitHubClient initialization and URL construction."""
    client = GitHubClient(owner="my-owner", repo="my-repo", token="secret-token")
    assert client.owner == "my-owner"
    assert client.repo == "my-repo"
    assert client._token == "secret-token"
    assert client._base_url == "https://api.github.com/repos/my-owner/my-repo/pulls"


def test_create_pull_request_missing_token():
    """Tests that create_pull_request raises GitHubClientError when token is missing."""
    client = GitHubClient(owner="my-owner", repo="my-repo", token=None)
    with pytest.raises(GitHubClientError) as exc_info:
        client.create_pull_request("feature-branch", "Fix bug", "PR description")
    assert "GitHub token is missing" in str(exc_info.value)


@patch("urllib.request.urlopen")
def test_create_pull_request_success(mock_urlopen):
    """Tests successful pull request creation, verifying headers, payload, and PR number return."""
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(
        {"number": 28, "html_url": "https://github.com/my-owner/my-repo/pull/28"}
    ).encode("utf-8")
    mock_urlopen.return_value.__enter__.return_value = mock_response

    client = GitHubClient(owner="my-owner", repo="my-repo", token="valid-token")
    pr_num = client.create_pull_request("feature-branch", "Fix bug", "PR description")

    assert pr_num == "28"
    mock_urlopen.assert_called_once()
    req = mock_urlopen.call_args[0][0]
    assert req.headers["Authorization"] == "Bearer valid-token"
    assert req.headers["Accept"] == "application/vnd.github+json"
    assert req.headers["Content-type"] == "application/json"

    data = json.loads(req.data.decode("utf-8"))
    assert data["title"] == "Fix bug"
    assert data["body"] == "PR description"
    assert data["head"] == "feature-branch"
    assert data["base"] == "main"


@patch("urllib.request.urlopen")
def test_create_pull_request_http_error(mock_urlopen):
    """Tests HTTPError handling, verifying status code and response body preservation."""
    error_body = json.dumps({"message": "Validation Failed", "errors": ["Branch already exists"]})
    mock_fp = io.BytesIO(error_body.encode("utf-8"))

    http_err = urllib.error.HTTPError(
        url="https://api.github.com/...",
        code=422,
        msg="Unprocessable Entity",
        hdrs={},
        fp=mock_fp,
    )
    mock_urlopen.side_effect = http_err

    client = GitHubClient(owner="my-owner", repo="my-repo", token="valid-token")
    with pytest.raises(GitHubClientError) as exc_info:
        client.create_pull_request("feature-branch", "Fix bug", "PR description")

    err_str = str(exc_info.value)
    assert "HTTP 422" in err_str
    assert "Validation Failed" in err_str


@patch("urllib.request.urlopen")
def test_create_pull_request_url_error(mock_urlopen):
    """Tests network URLError handling (e.g. DNS failure or connection refused)."""
    url_err = urllib.error.URLError(reason="Connection refused")
    mock_urlopen.side_effect = url_err

    client = GitHubClient(owner="my-owner", repo="my-repo", token="valid-token")
    with pytest.raises(GitHubClientError) as exc_info:
        client.create_pull_request("feature-branch", "Fix bug", "PR description")

    err_str = str(exc_info.value)
    assert "Network Error: Connection refused" in err_str


@patch("urllib.request.urlopen")
def test_create_pull_request_unexpected_exception(mock_urlopen):
    """Tests unexpected runtime exception handling."""
    mock_urlopen.side_effect = RuntimeError("System socket crash")

    client = GitHubClient(owner="my-owner", repo="my-repo", token="valid-token")
    with pytest.raises(GitHubClientError) as exc_info:
        client.create_pull_request("feature-branch", "Fix bug", "PR description")

    assert "Unexpected API client error" in str(exc_info.value)
