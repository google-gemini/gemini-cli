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

"""End-to-End Triage & PR Generation Evaluation Runner.

Runs the evaluation pipeline end-to-end for select issues or all issues:
1. Runs the Triage Agent (without judge) to ingest golden issues and generate PR Gen-compatible spec JSONs.
2. Ingests the generated spec JSONs into the PR Generation eval suite (Coding + Evaluator Agent).
3. Optionally executes the LLM Diff Judge on PR generation results.
4. Generates an interactive HTML diff visualizer report.

Usage:
  python3 evals/pr-generation/run_e2e_triage_pr_gen_eval.py --issues 14722 20355 [--run-name <name>] [--judge|--no-judge]
"""

import argparse
import datetime
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional, Union

PR_GEN_DIR = Path(__file__).resolve().parent
EVALS_DIR = PR_GEN_DIR.parent
CARETAKER_ROOT = EVALS_DIR.parent
TRIAGE_DIR = EVALS_DIR / "triage"

for path_entry in (PR_GEN_DIR, EVALS_DIR, CARETAKER_ROOT, TRIAGE_DIR):
    if str(path_entry) not in sys.path:
        sys.path.insert(0, str(path_entry))


def parse_args():
    parser = argparse.ArgumentParser(
        description="End-to-End Triage & PR Generation Evaluation Suite Runner"
    )
    parser.add_argument(
        "--issues",
        "--issue",
        nargs="+",
        help="GitHub issue number(s) to evaluate, or 'all' for full dataset",
    )
    parser.add_argument(
        "--run-name",
        type=str,
        default=None,
        help="Run identifier (defaults to timestamp-based name, e.g. e2e_run_YYYYMMDD_HHMMSS)",
    )
    parser.add_argument(
        "--triage-concurrency",
        type=int,
        default=4,
        help="Max parallel worker threads for Stage 1 (Triage Agent)",
    )
    parser.add_argument(
        "--prgen-concurrency",
        type=int,
        default=1,
        help="Max parallel worker processes for Stage 2 (PR Gen Agent)",
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=5,
        help="Max repair attempts per test case in PR Gen suite",
    )
    parser.add_argument(
        "--judge",
        action="store_true",
        default=True,
        help="Execute LLM Diff Judge evaluation after PR generation (default: True)",
    )
    parser.add_argument(
        "--no-judge",
        action="store_false",
        dest="judge",
        help="Disable LLM Diff Judge evaluation",
    )
    parser.add_argument(
        "--gcs",
        action="store_true",
        default=False,
        help="Upload evaluation artifacts and logs to GCS bucket",
    )
    parser.add_argument(
        "--keep-triage-specs",
        action="store_true",
        default=True,
        help="Retain intermediate triage spec JSONs in <run_dir>/triage_specs/",
    )
    return parser.parse_args()


def run_e2e_evaluation():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    args = parse_args()

    # Resolve run name and directories
    if not args.run_name:
        args.run_name = datetime.datetime.now().strftime("e2e_run_%Y%m%d_%H%M%S")

    runs_base_dir = PR_GEN_DIR / "run_outputs"
    run_dir = runs_base_dir / args.run_name
    triage_specs_dir = run_dir / "triage_specs"
    triage_specs_dir.mkdir(parents=True, exist_ok=True)

    print("\n==========================================================")
    print(f" 🚀 STARTING END-TO-END EVALUATION RUN: {args.run_name}")
    print("==========================================================")
    print(f"  Target Run Directory: {run_dir}")
    print(f"  Triage Specs Dir:     {triage_specs_dir}")
    print(f"  Triage Concurrency:   {args.triage_concurrency}")
    print(f"  PR Gen Concurrency:   {args.prgen_concurrency}")
    print(f"  LLM Diff Judge:       {'ENABLED' if args.judge else 'DISABLED'}")
    print("==========================================================\n")

    start_time = time.time()

    # -------------------------------------------------------------------------
    # STAGE 1: Triage Agent Execution (Spec Generation)
    # -------------------------------------------------------------------------
    print("==========================================================")
    print(" 🛠️ STAGE 1: Executing Triage Agent (Spec Generation)...")
    print("==========================================================")

    # Process filter_issues parameter
    filter_issues: Optional[Union[List[int], str]] = None
    if args.issues:
        if len(args.issues) == 1 and args.issues[0].lower() == "all":
            filter_issues = "all"
        else:
            try:
                filter_issues = [int(x) for x in args.issues]
            except ValueError:
                filter_issues = args.issues

    try:
        from evals.triage.runner import run_suite as run_triage_suite
        triage_results = run_triage_suite(
            filter_issues=filter_issues,
            concurrency=args.triage_concurrency,
            judge=False,  # No triage judge in spec generation mode
            save=False,
            run_name=args.run_name,
            output_dir=triage_specs_dir,
        )
    except Exception as e:
        logging.error("Failed to execute Stage 1 (Triage Agent): %s", e)
        sys.exit(1)

    triage_specs = list(triage_specs_dir.glob("*.json"))
    if not triage_specs:
        # Fallback: check if runner wrote to default output directory or search run_dir
        fallback_specs = list(run_dir.glob("**/*.json"))
        for spec in fallback_specs:
            if spec.parent != triage_specs_dir and spec.name != "test_results.json":
                import shutil
                shutil.copy(spec, triage_specs_dir)
        triage_specs = list(triage_specs_dir.glob("*.json"))

    print(f"\n✅ STAGE 1 COMPLETE: Generated {len(triage_specs)} spec JSON(s) in {triage_specs_dir}")

    if not triage_specs:
        logging.error("No triage spec JSON files were generated. Aborting E2E run.")
        sys.exit(1)

    # -------------------------------------------------------------------------
    # STAGE 2: PR Generation Evaluation Suite (eval_suite.py)
    # -------------------------------------------------------------------------
    print("\n==========================================================")
    print(" ⚡ STAGE 2: Executing PR Generation Eval Suite...")
    print("==========================================================")

    eval_suite_cmd = [
        sys.executable,
        str(PR_GEN_DIR / "eval_suite.py"),
        "--input-path", str(triage_specs_dir),
        "--run-name", args.run_name,
        "--max-workers", str(args.prgen_concurrency),
        "--max-attempts", str(args.max_attempts),
    ]
    if args.judge:
        eval_suite_cmd.append("--judge")
    if args.gcs:
        eval_suite_cmd.append("--gcs")

    try:
        subprocess.run(eval_suite_cmd, check=True, cwd=str(CARETAKER_ROOT))
    except subprocess.CalledProcessError as e:
        logging.error("Stage 2 (PR Gen Eval Suite) encountered errors: %s", e)

    # -------------------------------------------------------------------------
    # STAGE 3: Interactive Diff Visualizer Generation
    # -------------------------------------------------------------------------
    print("\n==========================================================")
    print(" 📊 STAGE 3: Generating Interactive Diff Viewer Report...")
    print("==========================================================")

    diff_viewer_cmd = [
        sys.executable,
        str(PR_GEN_DIR / "generate_diff_viewer.py"),
        "--run-name", args.run_name,
        "--input-path", str(triage_specs_dir),
    ]

    try:
        subprocess.run(diff_viewer_cmd, check=True, cwd=str(CARETAKER_ROOT))
    except subprocess.CalledProcessError as e:
        logging.warning("Stage 3 (Diff Viewer Generator) warning: %s", e)

    total_elapsed = time.time() - start_time
    html_report_path = run_dir / f"{args.run_name}_diff_viewer.html"

    print("\n==========================================================")
    print(f" ✨ END-TO-END EVALUATION RUN COMPLETE ({total_elapsed:.2f}s)")
    print("==========================================================")
    print(f"  Run Identifier:  {args.run_name}")
    print(f"  Run Directory:   {run_dir}")
    if html_report_path.exists():
        print(f"  HTML Report:     {html_report_path}")
    print("==========================================================\n")


if __name__ == "__main__":
    run_e2e_evaluation()
