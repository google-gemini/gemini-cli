"""
Evaluation Benchmark Runner for Gemini CLI Triage Worker.

Executes parallel LLM unit evaluations against curated golden issues,
checks categorization match, evaluates Workable Specs,
and persists structured results under evals/triage/results/.

Uses Git Worktrees for 100% thread-safe parallel checkouts across different commit SHAs.
"""

import os
import sys
import json
import time
import argparse
import datetime
from pathlib import Path
from os.path import abspath, dirname
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv

# Ensure repository root and cloudrun/triage-worker are in sys.path
CARETAKER_DIR = abspath(os.path.join(dirname(__file__), "..", ".."))
TRIAGE_WORKER_DIR = os.path.join(CARETAKER_DIR, "cloudrun", "triage-worker")

if CARETAKER_DIR not in sys.path:
    sys.path.insert(0, CARETAKER_DIR)
if TRIAGE_WORKER_DIR not in sys.path:
    sys.path.insert(0, TRIAGE_WORKER_DIR)

load_dotenv()

from triage_orchestrator import process_issue_triage
from evals.triage.judge import evaluate_categorization, judge_workable_spec
from evals.triage.helpers.worktrees import get_repo, add_worktree, remove_worktree
from evals.triage.helpers.dataset import load_issues, prep_payload
from evals.triage.helpers.summary import init_dir, save_issue_result, calc_summary


def eval_issue(golden_issue: Dict[str, Any], worker_id: int) -> Dict[str, Any]:
    """Evaluates a single issue under ThreadPoolExecutor using an isolated Git Worktree."""
    issue_num = golden_issue.get("issue_number")
    title = golden_issue.get("issue_title")
    target_version = golden_issue.get("target_version", "main")
    actual_version = target_version

    payload = prep_payload(golden_issue)

    try:
        worktree_dir, actual_version = add_worktree(worker_id, target_version)
        print(f"[TEST START] Issue #{issue_num} (Version: {actual_version[:10]})")

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

        cat_eval = evaluate_categorization(metadata, golden_issue)

        golden_spec = golden_issue.get("expected_workable_spec", {})
        spec_grade = {}
        if golden_issue.get("expected_quality") == "OK" and golden_spec:
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
                "quality": golden_issue.get("expected_quality"),
                "effort": golden_issue.get("expected_effort"),
                "workable_spec": golden_issue.get("expected_workable_spec", {})
            },
            "judge_evaluation": spec_grade
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
            "spec_grade": spec_grade
        }
    except Exception as e:
        err_msg = f"{e}"
        print(f"  ❌ [Issue #{issue_num}] Worker execution failed: {err_msg}")
        
        err_record = {
            "issue_number": issue_num,
            "title": title,
            "target_version": target_version,
            "actual_version": actual_version,
            "error": err_msg,
            "judge_evaluation": {
                "reasoning": {"error": f"Worker execution error: {err_msg}"}
            }
        }
        if os.environ.get("LOCAL_LOG_DIR"):
            issues_dir = Path(os.environ["LOCAL_LOG_DIR"])
            save_issue_result(issues_dir, issue_num, err_record)

        return {"success": False, "issue_number": issue_num, "error": err_msg}
    finally:
        remove_worktree(worker_id)


def run_suite(
    filter_issues: Optional[List[int]] = None,
    concurrency: int = 5,
    note: Optional[str] = None,
    save: bool = True
) -> None:
    """Runs evaluation suite using Git Worktrees."""
    issues = load_issues(filter_issues=filter_issues)
    if not issues:
        print("❌ No golden issues matched the specified issue filter.")
        return

    get_repo()
    run_dir = init_dir(save)

    print(f"\n========================================================")
    print(f"  Gemini CLI Triage Worker Benchmark Suite (Git Worktrees)")
    print(f"========================================================")
    print(f"[EVAL] Loaded {len(issues)} golden issue(s).")
    if filter_issues:
        print(f"[EVAL] Filtered Issues: {filter_issues}")
    if note:
        print(f"[EVAL] Run Note: '{note}'")
    print(f"[EVAL] Parallel Workers: {concurrency}.")
    print(f"[EVAL] Save Results: {save}.")
    if run_dir:
        print(f"[EVAL] Run Output Folder: {run_dir}/\n")
    else:
        print(f"[EVAL] [--no-save] Skipping disk persistence.\n")

    start_timestamp = datetime.datetime.now().isoformat()

    results = []

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_to_issue = {
            executor.submit(eval_issue, item, worker_id=i % concurrency): item 
            for i, item in enumerate(issues)
        }
        for future in as_completed(future_to_issue):
            results.append(future.result())

    end_timestamp = datetime.datetime.now().isoformat()

    calc_summary(
        run_dir=run_dir,
        note=note,
        start_timestamp=start_timestamp,
        end_timestamp=end_timestamp
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run parallel evaluation suite over golden issue dataset using Git Worktrees.")
    parser.add_argument("--issues", type=str, default=None, help="Comma-separated issue numbers to test (e.g. --issues 28052,25693)")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of parallel workers (default: 5)")
    parser.add_argument("--note", type=str, default=None, help="Optional description note for this evaluation run (saved in summary.json)")
    parser.add_argument("--save", action=argparse.BooleanOptionalAction, default=True, help="Persist structured evaluation run results to disk under evals/triage/results/ (default: True, use --no-save to skip)")

    args = parser.parse_args()
    
    filter_issues = None
    if args.issues:
        filter_issues = [int(x.strip()) for x in args.issues.split(",") if x.strip().isdigit()]

    run_suite(
        filter_issues=filter_issues,
        concurrency=args.concurrency,
        note=args.note,
        save=args.save
    )


if __name__ == "__main__":
    main()
