"""
Evaluation Benchmark Runner for Gemini CLI Triage Worker.

Executes parallel LLM unit evaluations against curated golden issues,
checks categorization match, evaluates Workable Specs using a 5-item Binary Checklist,
logs execution timing, and persists structured results under evals/triage/results/.

Uses Git Worktrees for 100% thread-safe parallel checkouts across different commit SHAs.
"""

import re
import os
import sys
import json
import glob
import time
import argparse
import datetime
import subprocess
from os.path import abspath, dirname
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# =====================================================================
# Path Resolution & Environment Initialization
# =====================================================================

PROJECT_ROOT = abspath(os.path.join(dirname(__file__), "..", ".."))
TRIAGE_WORKER_DIR = os.path.join(PROJECT_ROOT, "cloudrun", "triage_worker")

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if TRIAGE_WORKER_DIR not in sys.path:
    sys.path.insert(0, TRIAGE_WORKER_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

# Store agent execution trajectory logs locally under evals/triage/results/logs/ during evaluation runs
os.environ["GCS_LOGGING"] = "LOCAL"

from cloudrun.triage_worker.triage_orchestrator import process_issue_triage
from judge import evaluate_categorization, judge_workable_spec
from tools.summary import calculate_and_print_summary

DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset", "golden-issues")
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
TARGET_REPO_DIR = os.path.join(os.path.dirname(__file__), "target_repo")
WORKTREES_DIR = os.path.join(os.path.dirname(__file__), "worktrees")


# =====================================================================
# Target Repository & Git Worktree Management
# =====================================================================

def ensure_base_repository() -> str:
    """Ensures base target repository google-gemini/gemini-cli is cloned and fetched once upfront."""
    if not os.path.exists(TARGET_REPO_DIR):
        print(f"[EVAL] Target repository missing at {TARGET_REPO_DIR}. Cloning google-gemini/gemini-cli...")
        subprocess.run(["git", "clone", "https://github.com/google-gemini/gemini-cli.git", TARGET_REPO_DIR], check=True)
    else:
        subprocess.run(["git", "fetch", "--all", "--tags"], cwd=TARGET_REPO_DIR, capture_output=True)
    return TARGET_REPO_DIR


def create_worker_worktree(worker_id: int, version: str):
    """Creates an isolated, lightweight Git Worktree for a worker slot in ~10ms. Returns (worktree_dir, actual_version)."""
    worktree_dir = os.path.join(WORKTREES_DIR, f"worker_{worker_id}")
    os.makedirs(WORKTREES_DIR, exist_ok=True)

    # Clean up any stale worktree for this worker slot
    subprocess.run(["git", "worktree", "remove", "--force", worktree_dir], cwd=TARGET_REPO_DIR, capture_output=True)

    actual_version = version
    # Create new isolated worktree at commit SHA 'version'
    res = subprocess.run(["git", "worktree", "add", "-f", worktree_dir, version], cwd=TARGET_REPO_DIR, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  [EVAL] Warning: Could not checkout commit '{version[:10]}' for worker {worker_id}. Falling back to 'main'.")
        subprocess.run(["git", "worktree", "add", "-f", worktree_dir, "main"], cwd=TARGET_REPO_DIR, capture_output=True)
        actual_version = "main"

    return worktree_dir, actual_version


def cleanup_worker_worktree(worker_id: int) -> None:
    """Removes a worker's temporary Git Worktree cleanly."""
    worktree_dir = os.path.join(WORKTREES_DIR, f"worker_{worker_id}")
    subprocess.run(["git", "worktree", "remove", "--force", worktree_dir], cwd=TARGET_REPO_DIR, capture_output=True)


# =====================================================================
# Dataset Loading
# =====================================================================

def load_golden_issues(filter_issues: Optional[List[int]] = None) -> List[Dict[str, Any]]:
    """Loads golden issue test cases from JSON files in dataset directory, optionally filtering by issue numbers."""
    if not os.path.exists(DATASET_DIR):
        raise FileNotFoundError(f"Dataset directory not found at {DATASET_DIR}")
    
    json_files = glob.glob(os.path.join(DATASET_DIR, "**", "gemini_cli_*.json"), recursive=True)
    issues = []
    for file_path in sorted(json_files):
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if filter_issues:
                if data.get("issue_number") in filter_issues:
                    issues.append(data)
            else:
                issues.append(data)
    return issues


# =====================================================================
# Parallel Issue Execution Unit
# =====================================================================

def test_single_issue(item: Dict[str, Any], worker_id: int, dry_run: bool) -> Dict[str, Any]:
    """Evaluates a single issue under ThreadPoolExecutor using an isolated Git Worktree."""
    issue_num = item.get("issue_number")
    title = item.get("issue_title")
    version = item.get("target_version", "main")
    
    payload = {
        "issue_number": issue_num,
        "title": title,
        "body": item.get("issue_body", ""),
        "repository": f"{item.get('owner', 'google-gemini')}/{item.get('repo', 'gemini-cli')}"
    }

    if dry_run:
        print(f"  [DRY RUN] [Issue #{issue_num}] Skipped LLM call (Target Version: {version[:10]}).")
        return {"success": True, "issue_number": issue_num, "dry_run": True, "execution_time_seconds": 0.0}

    # 1. Create worker's isolated Git Worktree in ~10ms
    worktree_dir, actual_version = create_worker_worktree(worker_id, version)
    os.environ["TARGET_CWD"] = worktree_dir

    print(f"\n[TEST START] Issue #{issue_num}: '{title[:50]}...' (Version: {actual_version[:10]})")
    
    try:
        start_time = time.time()
        success, raw_output = process_issue_triage(payload)
        execution_time_seconds = round(time.time() - start_time, 2)
        
        if not success:
            raise RuntimeError(f"Triage execution failed: {raw_output}")
            
        try:
            result = json.loads(raw_output)
        except Exception as parse_err:
            # Fallback: sanitize invalid JSON single-quote escapes (\' -> ')
            try:
                cleaned_output = re.sub(r"\\'", "'", raw_output)
                result = json.loads(cleaned_output)
            except Exception:
                raise ValueError(f"Failed to parse JSON output: {parse_err}") from parse_err

        metadata = result.get("triage_metadata", {})
        predicted_spec = result.get("workable_spec", {})

        # 1. Categorization check
        cat_eval = evaluate_categorization(metadata, item)
        print(f"  [Issue #{issue_num}] Quality Match: {'✅' if cat_eval['quality_match'] else '❌'} (Pred: {cat_eval['predicted_quality']}, Exp: {cat_eval['expected_quality']})")
        if cat_eval.get('expected_effort'):
            print(f"  [Issue #{issue_num}] Effort Match:  {'✅' if cat_eval['effort_match'] else '❌'} (Pred: {cat_eval['predicted_effort']}, Exp: {cat_eval['expected_effort']})")

        # 2. LLM Judge scoring using 4-criterion 0-2 Rubric Scale
        golden_spec = item.get("expected_workable_spec", {})
        spec_grade = {}
        if item.get("expected_quality") == "OK" and golden_spec:
            spec_grade = judge_workable_spec(predicted_spec, golden_spec)
            pts = spec_grade.get("total_points", 0)
            max_pts = spec_grade.get("max_points", 8)
            pct = spec_grade.get("spec_score_pct", 0.0)
            tfs = spec_grade.get("target_files_score", 0)
            rcs = spec_grade.get("root_cause_and_summary_score", 0)
            ips = spec_grade.get("implementation_plan_score", 0)
            tss = spec_grade.get("testing_strategy_score", 0)
            print(f"  [Issue #{issue_num}] Golden Spec Alignment Rubric -> {pts}/{max_pts} Points ({pct}%)")
            print(f"    • Target Files: {tfs}/2 | Root Cause: {rcs}/2 | Plan: {ips}/2 | Testing: {tss}/2")
            reasoning = spec_grade.get("reasoning", {})
            if isinstance(reasoning, dict):
                for k, v in reasoning.items():
                    print(f"      - {k.replace('_', ' ').title()}: {v}")
            elif spec_grade.get("judge_reasoning"):
                print(f"    • Judge Reasoning: {spec_grade['judge_reasoning']}")

        # Immediately write per-issue result JSON if run issues_dir is active
        issues_dir = os.environ.get("LOCAL_LOG_DIR")
        if issues_dir and os.path.exists(issues_dir):
            file_path = os.path.join(issues_dir, f"gemini_cli_{issue_num}.json")
            record = {
                "issue_number": issue_num,
                "execution_time_seconds": execution_time_seconds,
                "categorization": cat_eval,
                "predicted": {"metadata": metadata, "workable_spec": predicted_spec},
                "expected": {
                    "quality": item.get("expected_quality"),
                    "effort": item.get("expected_effort"),
                    "workable_spec": item.get("expected_workable_spec", {})
                },
                "judge_evaluation": spec_grade
            }
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(record, f, indent=2)

        return {
            "success": True,
            "issue_number": issue_num,
            "item": item,
            "execution_time_seconds": execution_time_seconds,
            "predicted_metadata": metadata,
            "predicted_spec": predicted_spec,
            "cat_eval": cat_eval,
            "spec_grade": spec_grade
        }
    except Exception as e:
        err_msg = f"{e}"
        print(f"  ❌ [Issue #{issue_num}] Worker execution failed: {err_msg}")
        
        issues_dir = os.environ.get("LOCAL_LOG_DIR")
        if issues_dir and os.path.exists(issues_dir):
            file_path = os.path.join(issues_dir, f"gemini_cli_{issue_num}.json")
            err_record = {
                "issue_number": issue_num,
                "error": err_msg,
                "judge_evaluation": {
                    "reasoning": {"error": f"Worker execution error: {err_msg}"}
                }
            }
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(err_record, f, indent=2)

        return {"success": False, "issue_number": issue_num, "error": err_msg}
    finally:
        cleanup_worker_worktree(worker_id)





# =====================================================================
# Suite Orchestration & Main Entrypoint
# =====================================================================

def run_evaluation_suite(
    filter_issues: Optional[List[int]] = None,
    concurrency: int = 5,
    dry_run: bool = False,
    note: Optional[str] = None,
    save: bool = True
) -> None:
    """Runs evaluation suite in true 100% parallel execution using Git Worktrees and Binary Checklist."""
    issues = load_golden_issues(filter_issues=filter_issues)
    if not issues:
        print("❌ No golden issues matched the specified issue filter.")
        return

    if not dry_run:
        ensure_base_repository()

    run_dir = None
    issues_dir = None
    if save and not dry_run:
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = os.path.join(RESULTS_DIR, "runs", f"run_{timestamp_str}")
        issues_dir = os.path.join(run_dir, "issues")
        os.makedirs(issues_dir, exist_ok=True)
        os.environ["GCS_LOGGING"] = "LOCAL"
        os.environ["LOCAL_LOG_DIR"] = issues_dir
    else:
        os.environ["GCS_LOGGING"] = "OFF"

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
            executor.submit(test_single_issue, item, worker_id=i % concurrency, dry_run=dry_run): item 
            for i, item in enumerate(issues)
        }
        for future in as_completed(future_to_issue):
            res = future.result()
            if not res.get("success") or res.get("dry_run"):
                continue
            results.append(res)

    end_timestamp = datetime.datetime.now().isoformat()

    if not dry_run:
        calculate_and_print_summary(
            results,
            note=note,
            start_timestamp=start_timestamp,
            end_timestamp=end_timestamp,
            run_dir=run_dir
        )


def rejudge_failed_run(target_run: str) -> None:
    """Re-evaluates only judge-errored issues from a previous run directory (or 'latest')."""
    if target_run == "latest":
        runs = sorted(glob.glob(os.path.join(RESULTS_DIR, "runs", "run_*")))
        if not runs:
            print("❌ No existing run directories found under evals/triage/results/runs/.")
            return
        run_dir = runs[-1]
    else:
        run_dir = target_run if os.path.exists(target_run) else os.path.join(RESULTS_DIR, "runs", target_run)

    issues_dir = os.path.join(run_dir, "issues")
    if not os.path.exists(issues_dir):
        print(f"❌ Run issues directory not found: {issues_dir}")
        return

    issue_files = [f for f in sorted(glob.glob(os.path.join(issues_dir, "gemini_cli_*.json"))) if "debug" not in f]
    rejudged = 0
    print(f"\n[RE-JUDGE] Scanning {len(issue_files)} issue(s) in {os.path.basename(run_dir)} for judge errors...")

    for file_path in issue_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            reasoning = data.get("judge_evaluation", {}).get("reasoning", {})
            if isinstance(reasoning, dict) and "error" in reasoning:
                issue_num = data.get("issue_number")
                pred = data.get("predicted", {}).get("workable_spec", {})
                gold = data.get("expected", {}).get("workable_spec", {})

                if pred and gold:
                    print(f"  • Re-evaluating Issue #{issue_num}...")
                    spec_grade = judge_workable_spec(pred, gold)
                    data["judge_evaluation"] = spec_grade
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2)
                    rejudged += 1
                    print(f"    -> Score: {spec_grade.get('total_points', 0)}/8 ({spec_grade.get('spec_score_pct', 0)}%)\n")
        except Exception as e:
            print(f"  ❌ Error re-judging {file_path}: {e}")

    print(f"✅ Completed re-judging {rejudged} failed issue(s).\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run parallel evaluation suite over golden issue dataset using Git Worktrees.")
    parser.add_argument("--issues", type=str, default=None, help="Comma-separated issue numbers to test (e.g. --issues 28052,25693)")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of parallel workers (default: 5)")
    parser.add_argument("--dry-run", action="store_true", help="Skip LLM calls and test dataset loading")
    parser.add_argument("--note", type=str, default=None, help="Optional description note for this evaluation run (saved in summary.json)")
    parser.add_argument("--save", action=argparse.BooleanOptionalAction, default=True, help="Persist structured evaluation run results to disk under evals/triage/results/ (default: True, use --no-save to skip)")
    parser.add_argument("--rejudge-failed", type=str, default=None, help="Re-evaluate only judge-errored specs in a previous run directory or 'latest' without re-running agents")

    args = parser.parse_args()

    if args.rejudge_failed:
        rejudge_failed_run(args.rejudge_failed)
        return
    
    filter_issues = None
    if args.issues:
        filter_issues = [int(x.strip()) for x in args.issues.split(",") if x.strip().isdigit()]

    run_evaluation_suite(
        filter_issues=filter_issues,
        concurrency=args.concurrency,
        dry_run=args.dry_run,
        note=args.note,
        save=args.save
    )


if __name__ == "__main__":
    main()
