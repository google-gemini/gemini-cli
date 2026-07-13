"""
Golden Issue Generator CLI Tool (Main Entrypoint).

CLI usage:
  python3 generate_golden_issue.py --issue <number> [--pr <number>]
"""

import sys
import json
import argparse
from pathlib import Path

TOOLS_DIR = str(Path(__file__).parent)
if TOOLS_DIR not in sys.path:
    sys.path.insert(0, TOOLS_DIR)

from fetch_github_info import (
    get_issue_details,
    get_pr_details,
    resolve_target_version
)
from generate_golden_spec import generate_golden_spec

OUTPUT_DIR = Path(__file__).parent.parent / "golden-issues"


def generate_golden_issue(owner: str, repo: str, issue_number: int, pr_number: int = None):
    """Main orchestrator for generating a brand-new Golden Issue JSON file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    file_path = OUTPUT_DIR / f"gemini_cli_{issue_number}.json"

    print(f"Fetching Issue #{issue_number} details from {owner}/{repo}...")
    issue_data = get_issue_details(owner, repo, issue_number)
    
    pr_data = {}
    if pr_number:
        print(f"Fetching PR #{pr_number} details from {owner}/{repo}...")
        pr_data = get_pr_details(owner, repo, pr_number)

    workable_spec = {}
    golden_spec_rationale = ""

    if pr_number:
        print(f"[EVAL] Generating Golden Workable Spec for Issue #{issue_number} using PR #{pr_number}...")
        spec_res = generate_golden_spec(owner, repo, issue_number, issue_data, pr_data)
        workable_spec = spec_res["workable_spec"]
        golden_spec_rationale = spec_res["golden_spec_rationale"]

    # Extract effort from labels if present
    labels = [l.get("name", "").lower() for l in issue_data.get("labels", []) if isinstance(l, dict)]
    effort_from_labels = ""
    for effort in ["small", "medium", "large"]:
        if f"effort/{effort}" in labels:
            effort_from_labels = effort.upper()
            break

    # Default quality to 'OK' if a PR is attached, otherwise empty string ''
    expected_quality_default = "OK" if pr_number else ""

    template = {
        "owner": owner,
        "repo": repo,
        "issue_number": issue_number,
        "issue_title": issue_data.get("title", ""),
        "issue_body": issue_data.get("body", ""),
        "pr_number": pr_number or 0,
        "target_version": resolve_target_version(owner, repo, issue_data, pr_data),
        "expected_quality": expected_quality_default,
        "expected_effort": effort_from_labels,
        "notes": f"Created at {issue_data.get('createdAt', '')} by automated generate_golden_issue.py",
        "golden_spec_rationale": golden_spec_rationale,
        "expected_workable_spec": workable_spec
    }

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2)

    print(f"Successfully saved golden issue file to: {file_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate a Golden Issue JSON file.")
    parser.add_argument("--issue", type=int, required=True, help="GitHub Issue number")
    parser.add_argument("--pr", type=int, default=None, help="Associated PR number (optional)")
    parser.add_argument("--owner", type=str, default="google-gemini", help="Repository owner")
    parser.add_argument("--repo", type=str, default="gemini-cli", help="Repository name")
    
    args = parser.parse_args()
    generate_golden_issue(args.owner, args.repo, args.issue, args.pr)


if __name__ == "__main__":
    main()
