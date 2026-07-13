"""
GitHub Information & Target Commit SHA Resolution Utility.

Provides helper functions for querying GitHub REST API, extracting issue/PR metadata,
resolving target repository commit SHAs, and assembling golden issue JSON templates.
"""

import os
import requests
from typing import Optional, Dict, Any


def get_github_headers() -> Dict[str, str]:
    """Retrieves GitHub authentication headers using GITHUB_TOKEN or GH_TOKEN env vars."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_issue_details(owner: str, repo: str, issue_number: int) -> Dict[str, Any]:
    """Queries GitHub REST API for issue details (title, body, createdAt, labels)."""
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}"
    resp = requests.get(url, headers=get_github_headers())
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to fetch issue #{issue_number} from GitHub API ({resp.status_code}): {resp.text}")
    
    data = resp.json()
    return {
        "owner": owner,
        "repo": repo,
        "number": data.get("number"),
        "title": data.get("title", ""),
        "body": data.get("body", "") or "",
        "createdAt": data.get("created_at", ""),
        "labels": data.get("labels", [])
    }


def get_pr_details(owner: str, repo: str, pr_number: int) -> Dict[str, Any]:
    """Queries GitHub REST API for PR details (title, body, baseRefOid, patch/diff)."""
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
    headers = get_github_headers()
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to fetch PR #{pr_number} from GitHub API ({resp.status_code}): {resp.text}")
    
    data = resp.json()
    
    # Fetch unified patch/diff
    diff_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
    diff_headers = headers.copy()
    diff_headers["Accept"] = "application/vnd.github.v3.diff"
    diff_resp = requests.get(diff_url, headers=diff_headers)
    diff_content = diff_resp.text if diff_resp.status_code == 200 else ""

    return {
        "number": data.get("number"),
        "title": data.get("title", ""),
        "body": data.get("body", "") or "",
        "baseRefOid": data.get("base", {}).get("sha", ""),
        "diff": diff_content
    }


def get_commit_sha_at_timestamp(owner: str, repo: str, created_at: str) -> str:
    """Queries GitHub REST API to find the closest commit SHA at or before the given timestamp."""
    if not created_at:
        return ""
    url = f"https://api.github.com/repos/{owner}/{repo}/commits?until={created_at}&per_page=1"
    resp = requests.get(url, headers=get_github_headers())
    if resp.status_code == 200:
        commits = resp.json()
        if isinstance(commits, list) and len(commits) > 0:
            return commits[0].get("sha", "")
    return ""


def resolve_target_version(owner: str, repo: str, issue_data: Dict[str, Any], pr_data: Optional[Dict[str, Any]] = None) -> str:
    """
    Resolves the target Git commit SHA for an issue:
    1. If PR data contains baseRefOid (base commit before PR fix was merged), use that.
    2. Otherwise, query GitHub REST API for the commit SHA at issue createdAt timestamp via get_commit_sha_at_timestamp().
    3. Fallback to 'main'.
    """
    if pr_data and pr_data.get("baseRefOid"):
        return pr_data["baseRefOid"]

    created_at = issue_data.get("createdAt", "")
    if created_at:
        try:
            sha = get_commit_sha_at_timestamp(owner, repo, created_at)
            if sha:
                return sha
        except Exception as e:
            print(f"[FETCH_GITHUB] Warning: Could not resolve commit SHA at timestamp: {e}")

    return "main"


