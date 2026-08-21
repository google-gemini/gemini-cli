#!/usr/bin/env python3
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

"""Local Evaluation Suite Runner for SSR Code Generator Agent.

Usage:
  python3 evals/pr-generation/eval_suite.py --input-path <dir_or_file> --run-name <name> [--max-workers <N>]
"""

import argparse
import asyncio
import json
import logging
import os
import shutil
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

EVAL_DIR = Path(__file__).resolve().parent
EVALS_DIR = EVAL_DIR.parent
CARETAKER_ROOT = EVALS_DIR.parent
PR_GENERATOR_DIR = CARETAKER_ROOT / "cloudrun" / "pr-generator"
WORKFLOW_DIR = PR_GENERATOR_DIR / "workflow"

for path_entry in (PR_GENERATOR_DIR, WORKFLOW_DIR, CARETAKER_ROOT, EVAL_DIR):
    if str(path_entry) not in sys.path:
        sys.path.insert(0, str(path_entry))

from helpers.eval_config import EvalConfig
from helpers.eval_orchestrator import EvalOrchestrator


import datetime





class RootWarningFilter(logging.Filter):
    """Filter to suppress SDK / Vertex retryable noise and System step warnings from root logger."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "System step error" in msg or "Task is overloaded" in msg or "extensible_stubs" in msg or "Servomatic" in msg:
            return False
        return True


class TestProgressFilter(logging.Filter):
    """Filter that only permits high-level test progress and status messages to stdout."""

    __test__ = False

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "System step error" in msg or "Task is overloaded" in msg:
            return False
        return (
            "Starting local evaluation for test case:" in msg
            or "completed:" in msg
            or "[Cleanup]" in msg
            or ("=== [LOCAL EVAL]" in msg and "Starting Iteration" not in msg)
        )


def parse_args():
    parser = argparse.ArgumentParser(description="SSR Code Generator Local Evaluation Suite")
    parser.add_argument("--input-path", required=True, help="Path to JSON test file or directory of JSON files")
    parser.add_argument("--run-name", required=True, help="Run identifier (e.g. 'run_1')")
    parser.add_argument("--max-workers", type=int, default=1, help="Max parallel test execution processes")
    parser.add_argument("--max-attempts", type=int, default=5, help="Max repair iterations per test case")
    parser.add_argument("--keep-env", action="store_true", help="Keep agent_environments directory after run")
    parser.add_argument("--judge", action="store_true", help="Automatically run LLM-as-a-Judge evaluation after completion")
    parser.add_argument("--gcs", action="store_true", default=False, help="Upload evaluation logs and artifacts to GCS bucket (disabled by default)")
    return parser.parse_args()


def load_test_files(input_path: str) -> list[tuple[str, dict]]:
    """Loads all valid test message JSON files from a file or directory."""
    files = []
    abs_path = os.path.abspath(input_path)
    if os.path.isfile(abs_path):
        paths = [abs_path]
    elif os.path.isdir(abs_path):
        paths = [
            os.path.join(abs_path, f)
            for f in sorted(os.listdir(abs_path))
            if f.endswith(".json") and not f.startswith(".")
        ]
    else:
        raise ValueError(f"Input path does not exist: {input_path}")

    for p in paths:
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    files.append((p, data))
        except Exception as e:
            print(f"Warning: Skipping invalid test JSON {p}: {e}")

    return files


def run_single_test(args_tuple: tuple) -> dict[str, Any]:
    """Worker process function executing a single evaluation test case."""
    file_path, doc_dict, run_dir, max_attempts, keep_env = args_tuple

    import warnings
    warnings.filterwarnings("ignore")

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    devnull = None
    fh = None
    env_dir = None
    logger = logging.getLogger("Orchestrator")

    try:
        devnull = open(os.devnull, "w")
        sys.stdout = devnull
        sys.stderr = devnull
        file_base = os.path.splitext(os.path.basename(file_path))[0]
        github_meta = doc_dict.get("github_metadata", {})
        raw_issue_num = github_meta.get("issue_number") or doc_dict.get("issue_number", 0)
        try:
            issue_num = int(raw_issue_num)
        except (ValueError, TypeError):
            issue_num = 0
        test_id = file_base if str(issue_num) in file_base else f"{file_base}_{issue_num}"

        VALID_QUALITIES = {"OK", "FEATURE", "NEEDS_INFO", "SPAM_EMPTY"}
        raw_quality = doc_dict.get("expected_quality")
        workable_spec = doc_dict.get("workable_spec")

        if raw_quality in VALID_QUALITIES:
            quality_label = raw_quality
        elif raw_quality:
            quality_label = str(raw_quality)
        elif not workable_spec:
            quality_label = "NO_SPEC"
        else:
            quality_label = "OK"

        # If issue quality is not OK ("FEATURE", "NEEDS_INFO", "SPAM_EMPTY", "NO_SPEC") or workable_spec is missing/empty, skip PR generation and mark as PASS
        if quality_label != "OK" or not workable_spec:
            return {
                "success": True,
                "status": "SKIPPED_NON_OK",
                "diff": "",
                "pr_details": f"PR generation skipped: Expected quality is '{quality_label}'.",
                "error": None,
                "attempts": 0,
                "max_attempts": max_attempts,
                "test_id": test_id,
                "file_base": file_base,
                "issue_num": issue_num,
                "line_count": 0,
                "runtime_seconds": 0.01,
                "expected_quality": quality_label,
            }

        # Setup distinct directories for this run under eval/run_outputs/{run_name}/
        env_dir = os.path.join(run_dir, "agent_environments", test_id)
        logs_dir = os.path.join(run_dir, "logs")
        json_dir = os.path.join(run_dir, "json")
        diffs_dir = os.path.join(run_dir, "outputs", "diffs")
        pr_details_dir = os.path.join(run_dir, "outputs", "pr_details")

        os.makedirs(env_dir, exist_ok=True)
        os.makedirs(logs_dir, exist_ok=True)
        os.makedirs(json_dir, exist_ok=True)
        os.makedirs(diffs_dir, exist_ok=True)
        os.makedirs(pr_details_dir, exist_ok=True)

        os.environ["LOCAL_TRACE_DIR"] = os.path.join(run_dir, "json")
        worker_ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
        log_file_txt = os.path.join(logs_dir, f"issue_{issue_num}_{worker_ts}_logs.log")

        # Set root logger level to WARNING to drop SDK transport chatter (RAW WS MSG)
        root = logging.getLogger()
        root.setLevel(logging.WARNING)
        for h in root.handlers:
            if not any(isinstance(f, RootWarningFilter) for f in h.filters):
                h.addFilter(RootWarningFilter())

        # Configure dedicated application logger for workflow
        logger.setLevel(logging.INFO)
        logger.propagate = False
        for h in logger.handlers[:]:
            logger.removeHandler(h)

        fh = logging.FileHandler(log_file_txt, mode="w", encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        logger.addHandler(fh)

        logger.info("Starting local evaluation for test case: %s", test_id)

        # Instantiate config (dynamically resolving repo from github_metadata) & orchestrator
        config = EvalConfig(workspace_root=env_dir, firestore_doc_dict=doc_dict)
        config.max_attempts = max_attempts
        orchestrator = EvalOrchestrator(config)

        test_start_time = time.time()
        # Execute async pipeline
        try:
            result = asyncio.run(orchestrator.run())
            result["test_id"] = test_id
            result["file_base"] = file_base
            result["issue_num"] = issue_num
            result["attempts"] = result.get("attempts", max_attempts)
            result["max_attempts"] = result.get("max_attempts", max_attempts)
            result["line_count"] = result.get("line_count")
            result["runtime_seconds"] = round(time.time() - test_start_time, 2)

            # Save output artifacts (including generated diff for EXCEEDED_LINE_LIMIT)
            if result.get("diff"):
                diff_path = os.path.join(diffs_dir, f"{test_id}_diff.diff")
                with open(diff_path, "w", encoding="utf-8") as f:
                    f.write(result["diff"])
            if result.get("success") and result.get("pr_details"):
                pr_path = os.path.join(pr_details_dir, f"{test_id}_pr_details.md")
                with open(pr_path, "w", encoding="utf-8") as f:
                    f.write(result["pr_details"])

            status_str = "PASSED" if result.get("success") else f"FAILED ({result.get('status', 'FAILED')})"
            logger.info("Test case %s completed: %s (Turns: %s/%s, Runtime: %.2fs)", test_id, status_str, result.get("attempts", "?"), max_attempts, result["runtime_seconds"])

        except Exception as e:
            logger.exception("Unhandled exception during test execution: %s", e)
            result = {
                "test_id": test_id,
                "file_base": file_base,
                "issue_num": issue_num,
                "success": False,
                "status": "CRASHED",
                "error": str(e),
                "attempts": 0,
                "max_attempts": max_attempts,
                "runtime_seconds": round(time.time() - test_start_time, 2),
            }
            logger.error("Test case %s completed: FAILED (CRASHED: %s)", test_id, e)
    finally:
        # Cleanup temporary environment folder unless keep_env is specified
        if env_dir and not keep_env and os.path.exists(env_dir):
            try:
                logger.info("[Cleanup] Deleting temporary agent environment: %s", env_dir)
                def _handle_remove_readonly(func, path, _):
                    import stat
                    try:
                        os.chmod(path, stat.S_IRWXU | stat.S_IWRITE | stat.S_IWUSR)
                        func(path)
                    except Exception:
                        pass
                shutil.rmtree(env_dir, onerror=_handle_remove_readonly)
            except OSError as err:
                if logger:
                    logger.warning("Failed to clean up env dir %s: %s", env_dir, err)

        # Remove and close logging handlers cleanly
        if fh is not None:
            logger.removeHandler(fh)
            fh.close()

        sys.stdout = old_stdout
        sys.stderr = old_stderr
        if devnull is not None and not devnull.closed:
            devnull.close()

    return result


def main():
    args = parse_args()
    import re
    args.run_name = re.sub(r"[^a-zA-Z0-9._-]", "", args.run_name).strip(".") or "default_run"
    # Configure GCS logging mode for local evaluation
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    if args.gcs:
        os.environ["DISABLE_GCS_LOGGING"] = "false"
        os.environ["EVAL_GCS_RUN_NAME"] = args.run_name
        os.environ["EVAL_GCS_RUN_TIMESTAMP"] = timestamp
    else:
        os.environ["DISABLE_GCS_LOGGING"] = "true"
        os.environ.pop("EVAL_GCS_RUN_NAME", None)
        os.environ.pop("EVAL_GCS_RUN_TIMESTAMP", None)

    # Create root run output directory under evals/pr-generation/run_outputs/{run_name}/
    runs_base_dir = (EVAL_DIR / "run_outputs").resolve()
    run_dir = os.path.join(runs_base_dir, args.run_name)
    os.makedirs(run_dir, exist_ok=True)

    test_files = load_test_files(args.input_path)
    if not test_files:
        print(f"Error: No valid test message JSON files found at '{args.input_path}'.")
        sys.exit(1)

    total_count = len(test_files)
    print("==========================================================")
    print(f" Starting Local Evaluation Suite Run: {args.run_name}")
    print(f" Input Target:  {args.input_path}")
    print(f" Test Cases:    {total_count}")
    print(f" Max Workers:   {args.max_workers}")
    print(f" Output Folder: {run_dir}")
    print("==========================================================\n")

    print(f"Test cases starting ({total_count} total)...\n")

    start_time = time.time()
    results_map = {}
    completed_count = 0
    passed_count = 0
    failed_count = 0

    tasks = [
        (file_path, doc_dict, run_dir, args.max_attempts, args.keep_env)
        for file_path, doc_dict in test_files
    ]

    from concurrent.futures import as_completed, ProcessPoolExecutor

    if args.max_workers > 1:
        with ProcessPoolExecutor(max_workers=args.max_workers) as executor:
            future_to_test = {
                executor.submit(run_single_test, t): t
                for t in tasks
            }
            for future in as_completed(future_to_test):
                completed_count += 1
                res = future.result()
                results_map[res["test_id"]] = res

                is_success = res.get("success", False)
                if is_success:
                    passed_count += 1
                else:
                    failed_count += 1

                test_id = res.get("test_id", "unknown")
                if res.get("status") == "SKIPPED_NON_OK":
                    status_str = f"SKIPPED ({res.get('expected_quality', 'NON_OK')})"
                elif is_success:
                    status_str = "PASSED"
                else:
                    status_str = f"FAILED ({res.get('status', 'FAILED')})"

                print(
                    f"Completed {test_id}: {status_str} | "
                    f"Completed: {completed_count}/{total_count} (Passed: {passed_count}, Failed: {failed_count})"
                )
    else:
        for t in tasks:
            res = run_single_test(t)
            completed_count += 1
            results_map[res["test_id"]] = res

            is_success = res.get("success", False)
            if is_success:
                passed_count += 1
            else:
                failed_count += 1

            test_id = res.get("test_id", "unknown")
            if res.get("status") == "SKIPPED_NON_OK":
                status_str = f"SKIPPED ({res.get('expected_quality', 'NON_OK')})"
            elif is_success:
                status_str = "PASSED"
            else:
                status_str = f"FAILED ({res.get('status', 'FAILED')})"

            print(
                f"Completed {test_id}: {status_str} | "
                f"Completed: {completed_count}/{total_count} (Passed: {passed_count}, Failed: {failed_count})"
            )

    results = []
    for file_path, doc_dict in test_files:
        file_base = os.path.splitext(os.path.basename(file_path))[0]
        github_meta = doc_dict.get("github_metadata", {})
        issue_num = github_meta.get("issue_number") or doc_dict.get("issue_number", "0")
        test_id = file_base if str(issue_num) in file_base else f"{file_base}_{issue_num}"
        if test_id in results_map:
            results.append(results_map[test_id])

    elapsed = time.time() - start_time
    passed_count = sum(1 for r in results if r.get("success"))
    failed_count = len(results) - passed_count

    # Save test_results.json for downstream evaluation tools (like eval_diff_judge)
    json_results_path = os.path.join(run_dir, "test_results.json")
    try:
        with open(json_results_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
    except Exception as e:
        logging.warning("Failed to write test_results.json: %s", e)

    valid_runtimes = [float(r["runtime_seconds"]) for r in results if r.get("runtime_seconds") is not None]
    avg_runtime = sum(valid_runtimes) / len(valid_runtimes) if valid_runtimes else 0.0
    avg_runtime_str = f"{avg_runtime:.2f}s" if valid_runtimes else "N/A"

    # Generate Results.txt summary
    results_txt_path = os.path.join(run_dir, "Results.txt")
    with open(results_txt_path, "w", encoding="utf-8") as f:
        f.write("==========================================================\n")
        f.write(f" EVALUATION SUITE RESULTS: {args.run_name}\n")
        f.write("==========================================================\n")
        f.write(f"Total Test Cases: {len(results)}\n")
        f.write(f"Passed:           {passed_count}\n")
        f.write(f"Failed:           {failed_count}\n")
        f.write(f"Execution Time:   {elapsed:.2f} seconds\n")
        f.write(f"Max Attempts:     {args.max_attempts}\n")
        f.write(f"Average Runtime:  {avg_runtime_str}\n\n")

        f.write("----------------------------------------------------------\n")
        f.write(" DETAILED TEST BREAKDOWN\n")
        f.write("----------------------------------------------------------\n")
        for r in results:
            status_symbol = "✅ PASS" if r.get("success") else "❌ FAIL"
            attempts = r.get("attempts", "?")
            runtime_val = r.get("runtime_seconds")
            runtime_str = f"{runtime_val:.2f}s" if runtime_val is not None else "N/A"
            if r.get("status") == "SKIPPED_NON_OK":
                eq = r.get("expected_quality", "NON_OK")
                f.write(f"[{status_symbol}] {r['test_id']} (Quality: {eq}, Skipped PR Generation, Runtime: {runtime_str})\n")
            else:
                f.write(f"[{status_symbol}] {r['test_id']} (Turns: {attempts}, Runtime: {runtime_str})\n")
            if not r.get("success"):
                f.write(f"    Error: {r.get('error', 'Unknown failure')}\n")
            f.write("\n")

    print("\n==========================================================")
    print(f" Evaluation Suite Complete ({elapsed:.2f}s)")
    print(f" Results: {passed_count}/{len(results)} Passed ({failed_count} Failed)")
    print(f" Summary: {results_txt_path}")
    print("==========================================================")

    if args.judge:
        print("\n[--judge] Auto-triggering LLM-as-a-Judge diff evaluation...")
        try:
            from eval_diff_judge import run_diff_judge_eval
            run_diff_judge_eval(run_name=args.run_name, input_path=args.input_path)
        except Exception as e:
            logging.error("Failed to execute LLM diff judge evaluation: %s", e)

    if args.gcs:
        try:
            from gcs_logger import upload_eval_run_artifacts
            upload_eval_run_artifacts(run_dir, args.run_name)
        except Exception as e:
            logging.warning("Failed to upload evaluation run artifacts to GCS: %s", e)


if __name__ == "__main__":
    main()
