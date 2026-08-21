"""
Evaluation Benchmark Runner for Gemini CLI Triage Worker.

Executes parallel LLM triage against golden issues or arbitrary GitHub issues.
When --judge is enabled (default), evaluates categorization match and Workable Specs against ground truth.
When --no-judge is specified, bypasses evaluation & metrics, saving triaged issue JSON objects (in production Firestore schema)
under evals/triage/dataset/<run_name>/ for consumption by downstream tools (e.g. pr-generation/eval_suite.py).

Uses Git Worktrees for 100% thread-safe parallel checkouts across different commit SHAs.

CLI Usage:
  # Run benchmark evals on specific golden issues
  python3 -m evals.triage.runner --issues 19868,21527 --concurrency 5

  # Run spec generation without judging on all golden issues, saving to dataset/my_run/
  python3 -m evals.triage.runner --issues all --no-judge --run-name my_run

  # Run spec generation without judging on arbitrary GitHub issue numbers
  python3 -m evals.triage.runner --issues 19868,21527 --no-judge --run-name my_run
"""

import argparse
import datetime
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from os.path import abspath, dirname
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv

# Ensure repository root and cloudrun/triage-worker are in sys.path
CARETAKER_DIR = abspath(os.path.join(dirname(__file__), "..", ".."))
TRIAGE_WORKER_DIR = os.path.join(CARETAKER_DIR, "cloudrun", "triage-worker")

if CARETAKER_DIR not in sys.path:
    sys.path.insert(0, CARETAKER_DIR)
if TRIAGE_WORKER_DIR not in sys.path:
    sys.path.insert(0, TRIAGE_WORKER_DIR)

load_dotenv()

from evals.triage.helpers.dataset import load_issues, prep_payload
from evals.triage.helpers.github_api import (
    get_issue_details,
    resolve_target_version,
)
from evals.triage.helpers.summary import calc_summary, init_dir, save_issue_result
from evals.triage.helpers.worktrees import add_worktree, get_repo, remove_worktree
from evals.triage.judge import evaluate_categorization, judge_workable_spec
from triage_orchestrator import process_issue_triage

TRIAGE_EVAL_DIR = Path(__file__).resolve().parent


def eval_issue(
    golden_issue: Dict[str, Any],
    worker_id: int,
    judge: bool = True,
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Evaluates or triages a single issue under ThreadPoolExecutor using an isolated Git Worktree."""
    issue_num = golden_issue.get("issue_number") or golden_issue.get("github_metadata", {}).get("issue_number")
    title = (
        golden_issue.get("issue_title")
        or golden_issue.get("title")
        or golden_issue.get("github_metadata", {}).get("title", "")
    )
    target_version = (
        golden_issue.get("target_version")
        or golden_issue.get("github_metadata", {}).get("target_version", "main")
    )
    owner = (
        golden_issue.get("owner")
        or golden_issue.get("github_metadata", {}).get("owner", "google-gemini")
    )
    repo = (
        golden_issue.get("repo")
        or golden_issue.get("github_metadata", {}).get("repo", "gemini-cli")
    )
    pr_number = (
        golden_issue.get("pr_number")
        or golden_issue.get("github_metadata", {}).get("pr_number", 0)
    )
    actual_version = target_version

    payload = prep_payload(golden_issue)

    try:
        worktree_dir, actual_version = add_worktree(worker_id, target_version)
        print(f"[WORKER {worker_id}] Processing Issue #{issue_num} (Version: {actual_version[:10]})")

        start_time = time.time()
        success, raw_output = process_issue_triage(payload, target_cwd=worktree_dir)
        execution_time_seconds = round(time.time() - start_time, 2)

        if not success:
            raise RuntimeError(f"Triage execution failed: {raw_output}")

        try:
            result = json.loads(raw_output)
        except Exception:
            cleaned_output = raw_output.replace("\\'", "'")
            result = json.loads(cleaned_output)

        metadata = result.get("triage_metadata", {})
        predicted_spec = result.get("workable_spec", {})
        expected_quality = (
            metadata.get("quality")
            or result.get("quality")
            or result.get("expected_quality")
            or golden_issue.get("expected_quality", "OK")
        )
        expected_effort = (
            metadata.get("effort_estimate")
            or result.get("effort")
            or result.get("expected_effort")
            or golden_issue.get("expected_effort", "MEDIUM")
        )

        if not judge:
            # Mode: --no-judge (Spec Generator)
            # Writes top-level workable_spec and github_metadata complying with production Firestore schema
            spec_doc = {
                "owner": owner,
                "repo": repo,
                "issue_number": issue_num,
                "title": title,
                "status": expected_quality,
                "effort": expected_effort,
                "triage_metadata": metadata,
                "workable_spec": predicted_spec,
                "github_metadata": {
                    "owner": owner,
                    "repo": repo,
                    "issue_number": issue_num,
                    "title": title,
                    "target_version": actual_version,
                    "pr_number": pr_number,
                },
                "processed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "execution_time_seconds": execution_time_seconds,
            }

            if output_dir:
                output_dir.mkdir(parents=True, exist_ok=True)
                safe_repo = repo.replace("-", "_")
                spec_file = output_dir / f"{safe_repo}_{issue_num}.json"
                with open(spec_file, "w", encoding="utf-8") as f:
                    json.dump(spec_doc, f, indent=2)

            print(f"[SPEC CREATED] Issue #{issue_num} -> {output_dir}")
            return {
                "success": True,
                "issue_number": issue_num,
                "spec_doc": spec_doc,
                "execution_time_seconds": execution_time_seconds,
            }

        # Mode: --judge (Benchmark Evaluation)
        cat_eval = evaluate_categorization(metadata, golden_issue)

        golden_spec = (
            golden_issue.get("workable_spec")
            or golden_issue.get("expected_workable_spec", {})
        )
        golden_quality = (
            golden_issue.get("status")
            or golden_issue.get("expected_quality")
            or golden_issue.get("triage_metadata", {}).get("quality")
        )
        golden_effort = (
            golden_issue.get("effort")
            or golden_issue.get("expected_effort")
            or golden_issue.get("triage_metadata", {}).get("effort_estimate")
        )
        spec_grade = {}
        if golden_quality == "OK" and golden_spec:
            spec_grade = judge_workable_spec(predicted_spec, golden_spec)

        record = {
            "issue_number": issue_num,
            "title": title,
            "target_version": target_version,
            "actual_version": actual_version,
            "execution_time_seconds": execution_time_seconds,
            "categorization": cat_eval,
            "predicted": {"metadata": metadata, "workable_spec": predicted_spec},
            "expected": {
                "quality": golden_quality,
                "effort": golden_effort,
                "workable_spec": golden_spec,
            },
            "judge_evaluation": spec_grade,
        }
        if os.environ.get("LOCAL_LOG_DIR"):
            issues_dir = Path(os.environ["LOCAL_LOG_DIR"])
            save_issue_result(issues_dir, issue_num, record)

        print(f"[TEST FINISHED] Issue #{issue_num}")

        return {
            "success": True,
            "issue_number": issue_num,
            "golden_issue": golden_issue,
            "execution_time_seconds": execution_time_seconds,
            "predicted_metadata": metadata,
            "predicted_spec": predicted_spec,
            "cat_eval": cat_eval,
            "spec_grade": spec_grade,
        }
    except Exception as e:
        err_msg = f"{e}"
        print(f"  ❌ [Issue #{issue_num}] Worker execution failed: {err_msg}")

        if judge:
            err_record = {
                "issue_number": issue_num,
                "title": title,
                "target_version": target_version,
                "actual_version": actual_version,
                "error": err_msg,
                "judge_evaluation": {
                    "reasoning": {"error": f"Worker execution error: {err_msg}"}
                },
            }
            if os.environ.get("LOCAL_LOG_DIR"):
                issues_dir = Path(os.environ["LOCAL_LOG_DIR"])
                save_issue_result(issues_dir, issue_num, err_record)

        return {"success": False, "issue_number": issue_num, "error": err_msg}
    finally:
        remove_worktree(worker_id)


def run_suite(
    filter_issues: Optional[Union[List[int], str]] = None,
    concurrency: int = 5,
    note: Optional[str] = None,
    save: bool = True,
    judge: bool = True,
    run_name: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Runs evaluation suite or batch spec generation using Git Worktrees."""
    # Resolve target run_name
    if not run_name:
        run_name = datetime.datetime.now().strftime("run_%Y%m%d_%H%M%S")

    # If filter_issues is "all", treat as None for load_issues
    target_filter = None if filter_issues == "all" else filter_issues

    try:
        issues = load_issues(filter_issues=target_filter if isinstance(target_filter, list) else None)
    except Exception as e:
        print(f"⚠️ [EVAL] Could not stream issues from Firestore: {e}")
        issues = []

    # If specific issue numbers were requested but not found in the golden issue dataset, fetch from GitHub API
    if isinstance(target_filter, list) and target_filter:
        loaded_nums = {item.get("issue_number") for item in issues if item.get("issue_number") is not None}
        missing_nums = [n for n in target_filter if n not in loaded_nums]
        if missing_nums:
            print(f"[EVAL] Fetching metadata for {len(missing_nums)} issue(s) from GitHub API...")
            for num in missing_nums:
                try:
                    gh_details = get_issue_details("google-gemini", "gemini-cli", num)
                    target_ver = resolve_target_version("google-gemini", "gemini-cli", gh_details) or "main"
                    issues.append({
                        "issue_number": num,
                        "issue_title": gh_details.get("title", ""),
                        "issue_body": gh_details.get("body", ""),
                        "owner": "google-gemini",
                        "repo": "gemini-cli",
                        "target_version": target_ver,
                        "expected_quality": "OK",
                        "expected_effort": "MEDIUM",
                        "expected_workable_spec": {},
                    })
                except Exception as e:
                    print(f"⚠️ Failed to fetch GitHub issue #{num}: {e}")

    if not issues:
        print("❌ No issues matched the specified issue filter.")
        return []

    issues.sort(key=lambda x: x.get("issue_number", 0))

    get_repo()

    run_dir = None

    if not judge:
        if not output_dir:
            output_dir = TRIAGE_EVAL_DIR / "dataset" / run_name
        output_dir.mkdir(parents=True, exist_ok=True)
    else:
        run_dir = init_dir(save)

    print(f"\n========================================================")
    if judge:
        print(f"  Gemini CLI Triage Worker Benchmark Suite (Git Worktrees)")
    else:
        print(f"  Gemini CLI Triage Spec Generator (--no-judge)")
    print(f"========================================================")
    print(f"[RUN] Mode:             {'Benchmark Judging' if judge else 'Spec Generation (--no-judge)'}")
    print(f"[RUN] Run Name:         {run_name}")
    print(f"[RUN] Issue Count:      {len(issues)}")
    if target_filter:
        print(f"[RUN] Filtered Issues:  {target_filter}")
    if note:
        print(f"[RUN] Run Note:         '{note}'")
    print(f"[RUN] Parallel Workers: {concurrency}")
    if judge:
        print(f"[RUN] Save Results:     {save}")
        if run_dir:
            print(f"[RUN] Output Folder:    {run_dir}/")
        else:
            print(f"[RUN] [--no-save] Skipping disk persistence.")
    else:
        print(f"[RUN] Output Specs:     {output_dir}/")
    print(f"========================================================\n")

    start_timestamp = datetime.datetime.now().isoformat()
    start_time = time.time()
    results = []

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_to_issue = {
            executor.submit(
                eval_issue, item, worker_id=i % concurrency, judge=judge, output_dir=output_dir
            ): item
            for i, item in enumerate(issues)
        }
        for future in as_completed(future_to_issue):
            results.append(future.result())

    end_timestamp = datetime.datetime.now().isoformat()
    elapsed = round(time.time() - start_time, 2)

    if judge:
        calc_summary(
            run_dir=run_dir,
            note=note,
            start_timestamp=start_timestamp,
            end_timestamp=end_timestamp,
        )
    else:
        successful = [r for r in results if r.get("success")]
        failed = [r for r in results if not r.get("success")]
        print("\n========================================================")
        print(f" Batch Spec Generation Complete ({elapsed}s)")
        print(f" Output Folder: {output_dir}/")
        print(f" Successful:    {len(successful)} / {len(issues)}")
        print(f" Failed:        {len(failed)} / {len(issues)}")
        print("========================================================\n")

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run parallel evaluation suite or batch triage spec generation over issues."
    )
    parser.add_argument(
        "--issues",
        type=str,
        default=None,
        help="Issue filter: comma-separated issue numbers (e.g. --issues 19868,21527) or 'all' for all golden issues",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Number of parallel workers (default: 5)",
    )
    parser.add_argument(
        "--note",
        type=str,
        default=None,
        help="Optional description note for this run (saved in summary.json when judging)",
    )
    parser.add_argument(
        "--save",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Persist structured evaluation run results to disk under evals/triage/results/ (default: True)",
    )
    parser.add_argument(
        "--judge",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Run LLM-as-a-Judge diff/categorization evaluation (default: True, use --no-judge for spec generation)",
    )
    parser.add_argument(
        "--run-name",
        "--run_name",
        dest="run_name",
        type=str,
        default=None,
        help="Run name / folder identifier under evals/triage/dataset/ (spec gen) or evals/triage/results/ (judge)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory to save generated Firestore workable spec JSON documents when --no-judge is specified",
    )

    args = parser.parse_args()

    filter_issues: Optional[Union[List[int], str]] = None
    if args.issues:
        if args.issues.strip().lower() == "all":
            filter_issues = "all"
        else:
            filter_issues = [
                int(x.strip()) for x in args.issues.split(",") if x.strip().isdigit()
            ]

    output_path = Path(args.output_dir) if args.output_dir else None

    run_suite(
        filter_issues=filter_issues,
        concurrency=args.concurrency,
        note=args.note,
        save=args.save,
        judge=args.judge,
        run_name=args.run_name,
        output_dir=output_path,
    )


if __name__ == "__main__":
    main()
