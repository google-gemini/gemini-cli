# Copyright 2026 Google LLC
# Apache-2.0 License

"""Golden Issue Generator CLI Tool (Main Entrypoint).

Generates golden issue JSON files adhering to the production Firestore schema
(status='TRIAGED', generation_attempts=0, lock, workable_spec, and github_metadata).

CLI usage:
  python3 -m evals.triage.tools.generate_golden_issue --issue <number...> [--pr <number...>] [--output-dir <path>] [--max-workers <n>]
"""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from evals.triage.helpers.github_api import (
    get_issue_details,
    get_pr_details,
    resolve_target_version,
)
from evals.triage.helpers.generate_golden_spec import generate_golden_spec

TRIAGE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = TRIAGE_DIR / "dataset" / "golden-issues"


def get_output_filename(repo: str, issue_number: int) -> str:
    """Generates dynamic filename based on repository name and issue number."""
    safe_repo = repo.replace("-", "_")
    return f"{safe_repo}_{issue_number}.json"


def generate_golden_issue(
    owner: str,
    repo: str,
    issue_number: int,
    pr_number: Optional[int] = None,
    issue_data: Optional[Dict[str, Any]] = None,
    pr_data: Optional[Dict[str, Any]] = None,
    output_dir: Optional[Union[str, Path]] = None,
) -> Path:
    """Main orchestrator for generating a single Golden Issue JSON file in Firestore format."""
    if issue_data is None:
        print(f"Fetching Issue #{issue_number} details from {owner}/{repo}...")
        issue_data = get_issue_details(owner, repo, issue_number)

    if pr_number and pr_data is None:
        print(f"Fetching PR #{pr_number} details from {owner}/{repo}...")
        pr_data = get_pr_details(owner, repo, pr_number)
    elif pr_data is None:
        pr_data = {}

    workable_spec: Dict[str, Any] = {}
    golden_spec_rationale = ""

    if pr_number:
        print(f"[EVAL] Generating Golden Workable Spec for Issue #{issue_number} using PR #{pr_number}...")
        spec_res = generate_golden_spec(owner, repo, issue_number, issue_data, pr_data)
        workable_spec = spec_res.get("workable_spec", {})
        golden_spec_rationale = spec_res.get("golden_spec_rationale", "")

    target_ver = (
        resolve_target_version(owner, repo, issue_data, pr_data)
        if resolve_target_version
        else (pr_data.get("baseRefOid") if pr_data else "main")
    )

    # Production Firestore document schema for evaluation and ingestion
    template = {
        "status": "TRIAGED",
        "triage_attempts": 0,
        "generation_attempts": 0,
        "workable_spec": workable_spec,
        "github_metadata": {
            "owner": owner,
            "repo": repo,
            "issue_number": issue_number,
            "title": issue_data.get("title", ""),
            "target_version": target_ver,
            "pr_number": pr_number or 0,
        },
        "golden_spec_rationale": golden_spec_rationale,
        "lock": {
            "holder": None,
            "expires_at": None,
        },
        "error": "",
    }

    target_dir = Path(output_dir) if output_dir else OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = get_output_filename(repo, issue_number)
    file_path = target_dir / filename

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2)

    print(f"Successfully saved golden issue file to: {file_path}")
    return file_path


def batch_generate_golden_issues(
    owner: str,
    repo: str,
    issue_pr_pairs: List[Tuple[int, Optional[int]]],
    output_dir: Optional[Union[str, Path]] = None,
    max_workers: int = 4,
):
    """Concurrently generates golden issue JSON files for multiple (issue, pr) pairs."""
    if len(issue_pr_pairs) == 1:
        issue, pr = issue_pr_pairs[0]
        generate_golden_issue(
            owner=owner,
            repo=repo,
            issue_number=issue,
            pr_number=pr,
            output_dir=output_dir,
        )
        return

    print(f"\n==========================================================")
    print(f" Starting Concurrent Golden Issue Generation ({len(issue_pr_pairs)} items)")
    print(f" Target Repository: {owner}/{repo}")
    print(f" Max Workers:       {max_workers}")
    print(f"==========================================================\n")

    def _worker(pair: Tuple[int, Optional[int]]) -> Tuple[int, Optional[int], bool, Optional[str]]:
        issue, pr = pair
        try:
            generate_golden_issue(
                owner=owner,
                repo=repo,
                issue_number=issue,
                pr_number=pr,
                output_dir=output_dir,
            )
            return (issue, pr, True, None)
        except Exception as e:
            print(f"❌ Error generating golden issue #{issue} (PR #{pr}): {e}")
            return (issue, pr, False, str(e))

    success_count = 0
    failure_count = 0

    with ThreadPoolExecutor(max_workers=min(max_workers, len(issue_pr_pairs))) as executor:
        futures = [executor.submit(_worker, pair) for pair in issue_pr_pairs]
        for future in as_completed(futures):
            issue, pr, success, err = future.result()
            if success:
                success_count += 1
            else:
                failure_count += 1

    print(f"\n==========================================================")
    print(f" Batch Golden Issue Generation Complete")
    print(f" Total Issues: {len(issue_pr_pairs)} | Success: {success_count} | Failed: {failure_count}")
    print(f"==========================================================\n")


def main():
    parser = argparse.ArgumentParser(description="Generate Golden Issue JSON file(s) in Firestore format.")
    parser.add_argument("--issue", "--issues", type=int, nargs="+", required=True, help="GitHub Issue number(s)")
    parser.add_argument("--pr", "--prs", type=int, nargs="+", default=None, help="Associated PR number(s) (optional)")
    parser.add_argument("--owner", type=str, default="google-gemini", help="Repository owner")
    parser.add_argument("--repo", type=str, default="gemini-cli", help="Repository name")
    parser.add_argument("--output-dir", type=str, default=None, help="Custom output directory path for generated JSON specs")
    parser.add_argument("--max-workers", type=int, default=4, help="Max concurrent worker threads")

    args = parser.parse_args()

    issues = args.issue
    prs = args.pr or []

    # Match issue and PR arguments by position
    pairs = []
    for idx, issue in enumerate(issues):
        pr = prs[idx] if idx < len(prs) else None
        pairs.append((issue, pr))

    batch_generate_golden_issues(
        owner=args.owner,
        repo=args.repo,
        issue_pr_pairs=pairs,
        output_dir=args.output_dir,
        max_workers=args.max_workers,
    )


if __name__ == "__main__":
    main()
