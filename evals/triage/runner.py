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

# Disable GCS Cloud Storage logging upload during local evaluation runs
os.environ["GCS_LOGGING"] = "OFF"

from cloudrun.triage_worker.triage_orchestrator import process_issue_triage
from judge import evaluate_categorization, judge_workable_spec

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
        subprocess.run(["git", "fetch", "--all"], cwd=TARGET_REPO_DIR, capture_output=True)
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
            print(f"  ❌ [Issue #{issue_num}] Triage execution failed: {raw_output}")
            return {"success": False, "issue_number": issue_num, "error": raw_output}
            
        try:
            result = json.loads(raw_output)
        except Exception as e:
            # Fallback: sanitize invalid JSON single-quote escapes (\' -> ')
            try:
                cleaned_output = re.sub(r"(?<!\\)\\'", "'", raw_output)
                result = json.loads(cleaned_output)
            except Exception:
                print(f"  ❌ [Issue #{issue_num}] Failed to parse JSON output: {e}")
                return {"success": False, "issue_number": issue_num, "error": str(e)}

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
    finally:
        cleanup_worker_worktree(worker_id)


# =====================================================================
# Result Persistence & Reporting
# =====================================================================

def save_run_results(run_summary: Dict[str, Any], issue_results: List[Dict[str, Any]]) -> str:
    """Saves structured per-issue and summary evaluation results locally under evals/triage/results/."""
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = os.path.join(RESULTS_DIR, "runs", f"run_{timestamp_str}")
    issues_dir = os.path.join(run_dir, "issues")
    os.makedirs(issues_dir, exist_ok=True)

    for res in issue_results:
        issue_num = res.get("issue_number")
        file_path = os.path.join(issues_dir, f"gemini_cli_{issue_num}.json")
        record = {
            "issue_number": issue_num,
            "execution_time_seconds": res.get("execution_time_seconds", 0.0),
            "categorization": res.get("cat_eval", {}),
            "predicted": {
                "metadata": res.get("predicted_metadata", {}),
                "workable_spec": res.get("predicted_spec", {})
            },
            "expected": {
                "quality": res.get("item", {}).get("expected_quality"),
                "effort": res.get("item", {}).get("expected_effort"),
                "workable_spec": res.get("item", {}).get("expected_workable_spec", {})
            },
            "judge_evaluation": res.get("spec_grade", {})
        }
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2)

    summary_path = os.path.join(run_dir, "summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(run_summary, f, indent=2)

    return run_dir


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

    print(f"\n========================================================")
    print(f"  Gemini CLI Triage Worker Benchmark Suite (Git Worktrees)")
    print(f"========================================================")
    print(f"[EVAL] Loaded {len(issues)} golden issue(s).")
    if filter_issues:
        print(f"[EVAL] Filtered Issues: {filter_issues}")
    if note:
        print(f"[EVAL] Run Note: '{note}'")
    print(f"[EVAL] Parallel Workers: {concurrency}.")
    print(f"[EVAL] Save Results: {save}.\n")

    start_timestamp = datetime.datetime.now().isoformat()

    total_quality_matches = 0
    total_effort_matches = 0
    total_effort_tested = 0
    spec_pass_rates: List[float] = []
    execution_times: List[float] = []
    total_tested = 0
    issue_results: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_to_issue = {
            executor.submit(test_single_issue, item, worker_id=i % concurrency, dry_run=dry_run): item 
            for i, item in enumerate(issues)
        }
        for future in as_completed(future_to_issue):
            res = future.result()
            if not res.get("success") or res.get("dry_run"):
                continue
            total_tested += 1
            issue_results.append(res)

            exec_time = res.get("execution_time_seconds", 0.0)
            execution_times.append(exec_time)

            cat_eval = res.get("cat_eval", {})
            if cat_eval.get("quality_match"):
                total_quality_matches += 1
            
            total_effort_tested += 1
            if cat_eval.get("effort_match"):
                total_effort_matches += 1
                
            grade = res.get("spec_grade", {})
            if grade and "spec_score_pct" in grade:
                spec_pass_rates.append(grade.get("spec_score_pct", 0.0))

    end_timestamp = datetime.datetime.now().isoformat()

    if not dry_run and total_tested > 0:
        avg_spec_pass_rate = round(sum(spec_pass_rates) / len(spec_pass_rates), 1) if spec_pass_rates else 0.0
        avg_exec_time = round(sum(execution_times) / len(execution_times), 2) if execution_times else 0.0

        run_summary = {
            "start_timestamp": start_timestamp,
            "end_timestamp": end_timestamp,
            "note": note or "",
            "total_tested": total_tested,
            "workable_spec_count": len(spec_pass_rates),
            "quality_categorization_rate": total_quality_matches / total_tested if total_tested else 0,
            "effort_categorization_rate": total_effort_matches / total_effort_tested if total_effort_tested else 0,
            "avg_workable_spec_pass_rate_pct": avg_spec_pass_rate,
            "avg_execution_time_seconds": avg_exec_time
        }

        print(f"\n========================================================")
        print(f"  EVALUATION SUMMARY REPORT")
        print(f"========================================================")
        print(f"  Total Tested Issues:          {total_tested}")
        if note:
            print(f"  Run Note:                     {note}")
        print(f"  Quality Categorization Match: {total_quality_matches}/{total_tested} ({total_quality_matches/total_tested*100:.1f}%)")
        if total_effort_tested > 0:
            print(f"  Effort Categorization Match:  {total_effort_matches}/{total_effort_tested} ({total_effort_matches/total_effort_tested*100:.1f}%)")
        if spec_pass_rates:
            print(f"  Workable Spec Count:          {len(spec_pass_rates)} (OK quality issues)")
            print(f"  Avg Spec Checklist Pass Rate: {avg_spec_pass_rate:.1f}%")
        print(f"  Avg Execution Time:           {avg_exec_time:.2f}s")
        print(f"========================================================")

        if save:
            saved_path = save_run_results(run_summary, issue_results)
            print(f"📁 Saved structured run results to: {saved_path}/\n")
        else:
            print("ℹ️ [--no-save] Skipped persisting run results to disk.\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run parallel evaluation suite over golden issue dataset using Git Worktrees.")
    parser.add_argument("--issues", type=str, default=None, help="Comma-separated issue numbers to test (e.g. --issues 28052,25693)")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of parallel workers (default: 5)")
    parser.add_argument("--dry-run", action="store_true", help="Skip LLM calls and test dataset loading")
    parser.add_argument("--note", type=str, default=None, help="Optional description note for this evaluation run (saved in summary.json)")
    parser.add_argument("--save", action=argparse.BooleanOptionalAction, default=True, help="Persist structured evaluation run results to disk under evals/triage/results/ (default: True, use --no-save to skip)")

    args = parser.parse_args()
    
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
