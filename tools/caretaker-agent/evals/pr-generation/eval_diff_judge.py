#!/usr/bin/env python3
# Copyright 2026 Google LLC
# Apache-2.0 License

"""LLM-as-a-Judge Diff Evaluator for SSR Code Generator Evaluation Runs.

Usage:
    python3 evals/pr-generation/eval_diff_judge.py --run-name run_1 [--model gemini-3.6-flash]
"""

import argparse
import asyncio
import glob
import json
import logging
import os
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any

PR_GEN_DIR = Path(__file__).resolve().parent
EVALS_DIR = PR_GEN_DIR.parent
CARETAKER_ROOT = EVALS_DIR.parent
PR_GENERATOR_DIR = CARETAKER_ROOT / "cloudrun" / "pr-generator"

for path_entry in (PR_GENERATOR_DIR, PR_GEN_DIR, CARETAKER_ROOT):
    if str(path_entry) not in sys.path:
        sys.path.insert(0, str(path_entry))

from workflow.agent_runner import AgentRunner
from workflow.config import Config


RUNS_BASE_DIR = PR_GEN_DIR / "run_outputs"
JUDGE_PROMPT_PATH = PR_GEN_DIR / "judge_prompt.md"


def parse_args():
    parser = argparse.ArgumentParser(description="LLM-as-a-Judge Diff Evaluator")
    parser.add_argument("--run-name", required=True, help="Run identifier (e.g. 'run_1')")
    parser.add_argument("--input-path", "--input-dir", required=True, help="Input directory or file containing golden issue JSON specs")
    parser.add_argument("--model", default="gemini-3.6-flash", help="LLM model for judge evaluation")
    return parser.parse_args()


def load_judge_prompt_template() -> str:
    """Loads the markdown template for the judge prompt."""
    if not os.path.exists(JUDGE_PROMPT_PATH):
        raise FileNotFoundError(f"Judge prompt file not found: {JUDGE_PROMPT_PATH}")
    with open(JUDGE_PROMPT_PATH, "r", encoding="utf-8") as f:
        return f.read()


def fetch_true_diff(owner: str, repo: str, pr_number: int) -> str:
    """Fetches the ground-truth PR diff from GitHub."""
    if not owner or not repo or not pr_number:
        return ""
    if not re.match(r"^[a-zA-Z0-9_-]+$", str(owner)) or not re.match(r"^[a-zA-Z0-9._-]+$", str(repo)):
        logging.warning("Invalid owner or repository name: %s/%s", owner, repo)
        return ""
    try:
        pr_num = int(pr_number)
        if pr_num <= 0:
            return ""
    except (ValueError, TypeError):
        return ""

    url = f"https://github.com/{owner}/{repo}/pull/{pr_num}.diff"
    headers = {"User-Agent": "SSR-Eval-Judge"}
    token = os.environ.get("GIT_TOKEN") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")
    except Exception as e:
        logging.warning("Failed to fetch true diff from GitHub (%s): %s", url, e)
        return ""


def find_golden_spec_for_test(test_id: str, input_path: str) -> dict | None:
    """Finds matching reformatted golden issue JSON by test_id or issue number within input_path."""
    if not input_path or not os.path.exists(input_path):
        return None
    if os.path.isfile(input_path):
        try:
            with open(input_path, "r", encoding="utf-8") as f:
                doc = json.load(f)
                base = os.path.splitext(os.path.basename(input_path))[0]
                if base in test_id or test_id.startswith(base):
                    return doc
        except Exception:
            return None
        return None

    for filepath in glob.glob(os.path.join(input_path, "*.json")):
        base = os.path.splitext(os.path.basename(filepath))[0]
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                doc = json.load(f)
                issue_num = str(doc.get("github_metadata", {}).get("issue_number", ""))
                if base in test_id or test_id.startswith(base) or (issue_num and f"issue_{issue_num}" in test_id):
                    return doc
        except Exception:
            pass
    return None


async def evaluate_single_diff(
    test_id: str,
    proposed_diff: str,
    doc_dict: dict,
    prompt_template: str,
    model_name: str,
) -> dict[str, Any]:
    """Evaluates a single proposed diff against ground-truth using LLM judge."""
    github_meta = doc_dict.get("github_metadata", {})
    VALID_QUALITIES = {"OK", "FEATURE", "NEEDS_INFO", "SPAM_EMPTY"}
    expected_quality = doc_dict.get("expected_quality", "OK")
    workable_spec = doc_dict.get("workable_spec")

    # Handle non-OK quality status ("FEATURE", "NEEDS_INFO", "SPAM_EMPTY") or missing workable spec without calling LLM Judge
    if expected_quality != "OK" or not workable_spec:
        quality_label = expected_quality if expected_quality in VALID_QUALITIES else (expected_quality or "UNKNOWN")
        msg = f"PR generation skipped: Expected triage quality status is '{quality_label}'. No PR or workable spec required."
        return {
            "test_id": test_id,
            "skipped": True,
            "expected_quality": quality_label,
            "functional_score": 0,
            "quality_score": 0,
            "overall_score": 0,
            "functional_critique": msg,
            "quality_critique": msg,
            "verdict_description": msg,
            "success": True,
        }

    workable_spec = workable_spec or {}
    owner = github_meta.get("owner", "google-gemini")
    repo = github_meta.get("repo", "gemini-cli")
    pr_number = github_meta.get("pr_number", 0)

    true_diff = await asyncio.to_thread(fetch_true_diff, owner, repo, pr_number)
    if not true_diff:
        true_diff = "# (Ground truth diff unavailable from GitHub REST API)"

    # Render judge prompt template
    prompt = prompt_template.replace("{{OWNER}}", owner)
    prompt = prompt.replace("{{REPO}}", repo)
    prompt = prompt.replace("{{ISSUE_ID}}", str(workable_spec.get("issue_id", f"{owner}/{repo}#{github_meta.get('issue_number')}")))
    prompt = prompt.replace("{{ISSUE_TITLE}}", str(github_meta.get("title", "")))
    prompt = prompt.replace("{{ISSUE_SUMMARY}}", json.dumps(workable_spec.get("summary", {}), indent=2))
    prompt = prompt.replace("{{TRUE_DIFF}}", true_diff)
    prompt = prompt.replace("{{PROPOSED_DIFF}}", proposed_diff if proposed_diff.strip() else "# No changes generated.")

    config = Config()
    config.model_name = model_name
    agent_runner = AgentRunner(
        project_id=config.project_id,
        location=config.location,
        model_name=model_name,
    )

    try:
        raw_output, _ = await agent_runner.run_agent(
            role="LLM Diff Judge",
            prompt=prompt,
            repo_path=config.tmp_dir,
        )
        
        # Clean markdown code fences if present (```json ... ``` or ``` ... ```)
        cleaned_output = raw_output.strip()
        if cleaned_output.startswith("```"):
            cleaned_output = re.sub(r"^```(?:json)?\n?", "", cleaned_output)
            cleaned_output = re.sub(r"\n?```$", "", cleaned_output).strip()

        # Parse JSON payload from judge response
        parsed = None
        try:
            parsed = json.loads(cleaned_output)
        except Exception:
            json_match = re.search(r"\{[\s\S]*\}", cleaned_output)
            if json_match:
                try:
                    parsed = json.loads(json_match.group(0))
                except Exception:
                    pass

        if isinstance(parsed, dict):
            func_score = int(parsed.get("functional_score", parsed.get("score", 0)))
            qual_score = int(parsed.get("quality_score", parsed.get("score", 0)))
            func_critique = str(parsed.get("functional_critique", parsed.get("verdict_description", raw_output)))
            qual_critique = str(parsed.get("quality_critique", parsed.get("verdict_description", raw_output)))
            verdict = str(parsed.get("verdict_description", raw_output))
        else:
            func_score = 1 if "Score: 1" in raw_output or "2" in raw_output else 0
            qual_score = func_score
            func_critique = raw_output.strip()
            qual_critique = raw_output.strip()
            verdict = raw_output.strip()

        # Clamp scores between 0 and 3
        func_score = max(0, min(3, func_score))
        qual_score = max(0, min(3, qual_score))
        overall_score = func_score + qual_score

        return {
            "test_id": test_id,
            "functional_score": func_score,
            "quality_score": qual_score,
            "overall_score": overall_score,
            "functional_critique": func_critique,
            "quality_critique": qual_critique,
            "verdict_description": verdict,
            "success": True,
        }
    except Exception as e:
        logging.error("Failed LLM evaluation for %s: %s", test_id, e)
        return {
            "test_id": test_id,
            "functional_score": 0,
            "quality_score": 0,
            "overall_score": 0,
            "functional_critique": f"Evaluation exception: {e}",
            "quality_critique": f"Evaluation exception: {e}",
            "verdict_description": f"Evaluation exception: {e}",
            "success": False,
        }


def load_test_metrics_for_run(run_dir: str) -> tuple[dict[str, tuple[Any, Any]], dict[str, Any], dict[str, Any], dict[str, str], dict[str, str]]:
    """Loads turn counts, runtimes, line counts, statuses, and errors mapped by test_id from test_results.json or Results.txt."""
    turn_map = {}
    runtime_map = {}
    line_count_map = {}
    status_map = {}
    error_map = {}
    json_path = os.path.join(run_dir, "test_results.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                for item in json.load(f):
                    tid = item.get("test_id")
                    if tid:
                        turn_map[tid] = (item.get("attempts", "?"), item.get("max_attempts", "?"))
                        runtime_map[tid] = item.get("runtime_seconds")
                        if item.get("line_count"):
                            line_count_map[tid] = item.get("line_count")
                        if item.get("status"):
                            status_map[tid] = item.get("status")
                        if item.get("error"):
                            error_map[tid] = item.get("error")
            return turn_map, runtime_map, line_count_map, status_map, error_map
        except Exception as e:
            logging.warning("Failed to read test_results.json: %s", e)

    results_txt_path = os.path.join(run_dir, "Results.txt")
    if os.path.exists(results_txt_path):
        try:
            with open(results_txt_path, "r", encoding="utf-8") as f:
                for line in f:
                    match = re.search(r"\[.*?\]\s+(\S+)\s+completed:\s+(\S+)\s+\(Turns:\s+(\w+)/?(\w+)?(?:,\s+Runtime:\s+([\d.]+s))?\)", line)
                    if match:
                        tid = match.group(1)
                        status = match.group(2)
                        turns = match.group(3)
                        max_turns = match.group(4) or "?"
                        runtime = match.group(5)
                        turn_map[tid] = (turns, max_turns)
                        status_map[tid] = status
                        if runtime:
                            runtime_map[tid] = float(runtime.rstrip("s"))
        except Exception as e:
            logging.warning("Failed to read Results.txt: %s", e)

    return turn_map, runtime_map, line_count_map, status_map, error_map


async def evaluate_all_specs(
    spec_files: list[str],
    diffs_dir: str,
    turn_map: dict[str, tuple[Any, Any]],
    runtime_map: dict[str, Any],
    line_count_map: dict[str, Any],
    status_map: dict[str, str],
    error_map: dict[str, str],
    prompt_template: str,
    model: str,
    concurrency: int = 5,
) -> list[dict[str, Any]]:
    """Evaluates all test specs concurrently within a single asyncio event loop."""
    semaphore = asyncio.Semaphore(concurrency)

    async def _eval_one(spec_file: str) -> dict[str, Any]:
        async with semaphore:
            test_id = os.path.splitext(os.path.basename(spec_file))[0]
            doc_dict = {}
            try:
                with open(spec_file, "r", encoding="utf-8") as f:
                    doc_dict = json.load(f)
            except Exception as e:
                logging.warning("Failed to read spec file %s: %s", spec_file, e)

            VALID_QUALITIES = {"OK", "FEATURE", "NEEDS_INFO", "SPAM_EMPTY"}
            raw_quality = doc_dict.get("expected_quality")
            workable_spec = doc_dict.get("workable_spec")
            test_status = status_map.get(test_id, "")

            if raw_quality in VALID_QUALITIES:
                quality_label = raw_quality
            elif raw_quality:
                quality_label = str(raw_quality)
            elif not workable_spec:
                quality_label = "NO_SPEC"
            else:
                quality_label = "OK"

            if quality_label != "OK" or not workable_spec or test_status == "SKIPPED_NON_OK":
                logging.info("Skipping LLM evaluation for non-OK / no-spec test case: %s (%s)", test_id, quality_label)
                msg = f"PR generation skipped: Expected triage quality status is '{quality_label}'."
                return {
                    "test_id": test_id,
                    "skipped": True,
                    "expected_quality": quality_label,
                    "functional_score": 0,
                    "quality_score": 0,
                    "overall_score": 0,
                    "functional_critique": msg,
                    "quality_critique": msg,
                    "verdict_description": msg,
                    "success": True,
                    "doc": doc_dict,
                }

            logging.info("Starting LLM evaluation for test case: %s", test_id)
            issue_num = doc_dict.get("github_metadata", {}).get("issue_number")

            # Resolve diff file for this test_id / issue_num
            candidate_diffs = [
                os.path.join(diffs_dir, f"{test_id}_diff.diff"),
                os.path.join(diffs_dir, f"{test_id}.diff"),
            ]
            if issue_num and os.path.exists(diffs_dir):
                candidate_diffs.extend(glob.glob(os.path.join(diffs_dir, f"issue_{issue_num}_*_diff.diff")))
                candidate_diffs.extend(glob.glob(os.path.join(diffs_dir, f"*{issue_num}*_diff.diff")))

            found_diff_path = None
            for cand in candidate_diffs:
                if os.path.exists(cand) and os.path.getsize(cand) > 0:
                    found_diff_path = cand
                    break

            # Resolve metrics from maps (checking test_id and issue_num keys)
            attempts, max_att = turn_map.get(test_id, ("?", "?"))
            runtime_sec = runtime_map.get(test_id)
            line_cnt = line_count_map.get(test_id)
            test_status = status_map.get(test_id, "")
            test_error = error_map.get(test_id, "")

            if attempts == "?" and issue_num:
                for k, v in turn_map.items():
                    if str(issue_num) in k:
                        attempts, max_att = v
                        runtime_sec = runtime_map.get(k)
                        line_cnt = line_count_map.get(k, line_cnt)
                        test_status = status_map.get(k, test_status)
                        test_error = error_map.get(k, test_error)
                        break

            if found_diff_path:
                with open(found_diff_path, "r", encoding="utf-8") as f:
                    proposed_diff = f.read()

                if proposed_diff.strip():
                    eval_res = await evaluate_single_diff(test_id, proposed_diff, doc_dict, prompt_template, model)
                else:
                    err_msg = f"FAILED: {test_error or 'Agent generated an empty diff file.'}"
                    eval_res = {
                        "test_id": test_id,
                        "functional_score": 0,
                        "quality_score": 0,
                        "overall_score": 0,
                        "functional_critique": err_msg,
                        "quality_critique": err_msg,
                        "verdict_description": err_msg,
                        "success": False,
                        "doc": doc_dict,
                    }
            else:
                err_msg = f"FAILED: {test_error or 'Agent failed to generate a response or diff.'}"
                eval_res = {
                    "test_id": test_id,
                    "functional_score": 0,
                    "quality_score": 0,
                    "overall_score": 0,
                    "functional_critique": err_msg,
                    "quality_critique": err_msg,
                    "verdict_description": err_msg,
                    "success": False,
                    "doc": doc_dict,
                }

            # If diff line count limit was exceeded, prefix BOTH critiques with the line count exceeded message
            if test_status == "EXCEEDED_LINE_LIMIT" or (test_error and "exceed" in test_error.lower()) or (line_cnt and line_cnt > 500):
                cnt_str = str(line_cnt) if line_cnt else ""
                if not cnt_str and test_error:
                    num_match = re.search(r"(\d+)\s+lines", test_error)
                    if num_match:
                        cnt_str = num_match.group(1)
                prefix = f"(Line Count Exceeded Limit: {cnt_str} lines) " if cnt_str else "(Line Count Exceeded Limit) "
                eval_res["functional_critique"] = prefix + eval_res.get("functional_critique", "")
                eval_res["quality_critique"] = prefix + eval_res.get("quality_critique", "")
                eval_res["verdict_description"] = prefix + eval_res.get("verdict_description", "")

            eval_res["attempts"] = attempts
            eval_res["max_attempts"] = max_att
            eval_res["runtime_seconds"] = runtime_sec

            logging.info(
                "Completed LLM evaluation for test case: %s (Func: %s/3, Qual: %s/3, Total: %s/6)",
                test_id,
                eval_res.get("functional_score", 0),
                eval_res.get("quality_score", 0),
                eval_res.get("overall_score", 0),
            )
            return eval_res

    return await asyncio.gather(*(_eval_one(sf) for sf in spec_files))


class JudgeProgressFilter(logging.Filter):
    """Filter that ONLY permits high-level judge evaluation progress log messages to stdout."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return (
            "Starting LLM evaluation for test case:" in msg
            or "Completed LLM evaluation for test case:" in msg
        )


def run_diff_judge_eval(run_name: str, input_path: str, model: str = "gemini-3.6-flash") -> list[dict[str, Any]]:
    """Programmatic execution engine for LLM-as-a-Judge evaluations."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for h in root.handlers[:]:
        root.removeHandler(h)

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    sh.addFilter(JudgeProgressFilter())
    root.addHandler(sh)

    run_dir = os.path.join(RUNS_BASE_DIR, run_name)
    diffs_dir = os.path.join(run_dir, "outputs", "diffs")

    if not os.path.exists(run_dir):
        print(f"Error: Run directory does not exist: {run_dir}")
        sys.exit(1)

    prompt_template = load_judge_prompt_template()
    turn_map, runtime_map, line_count_map, status_map, error_map = load_test_metrics_for_run(run_dir)
    results = []

    # Resolve input_path against CWD or CARETAKER_ROOT
    abs_input_path = os.path.abspath(input_path)
    if not os.path.exists(abs_input_path):
        candidate = os.path.abspath(os.path.join(CARETAKER_ROOT, input_path))
        if os.path.exists(candidate):
            abs_input_path = candidate

    spec_files = []
    if os.path.isdir(abs_input_path):
        spec_files = sorted([os.path.abspath(f) for f in glob.glob(os.path.join(abs_input_path, "*.json"))])
    elif os.path.isfile(abs_input_path):
        spec_files = [os.path.abspath(abs_input_path)]

    if not spec_files:
        print(f"Error: No test spec JSON files found in input_path '{input_path}'.")
        sys.exit(1)

    print("==========================================================")
    print(f" Starting LLM-as-a-Judge Evaluation: {run_name}")
    print(f" Input Path:          {input_path}")
    print(f" Total Test Cases:    {len(spec_files)}")
    print(f" Judge Model:         {model}")
    print("==========================================================\n")

    all_results = asyncio.run(
        evaluate_all_specs(spec_files, diffs_dir, turn_map, runtime_map, line_count_map, status_map, error_map, prompt_template, model)
    )

    results = [r for r in all_results if r and not r.get("skipped")]
    skipped_results = [r for r in all_results if r and r.get("skipped")]

    # Compute overall, functional, and quality score averages
    total_func = sum(r.get("functional_score", 0) for r in results)
    avg_func = total_func / len(results) if results else 0.0

    total_qual = sum(r.get("quality_score", 0) for r in results)
    avg_qual = total_qual / len(results) if results else 0.0

    total_overall = sum(r.get("overall_score", 0) for r in results)
    avg_overall = total_overall / len(results) if results else 0.0

    valid_turns = [int(r["attempts"]) for r in results if str(r.get("attempts", "")).isdigit()]
    avg_turns = sum(valid_turns) / len(valid_turns) if valid_turns else 0.0
    avg_turns_str = f"{avg_turns:.2f}" if valid_turns else "?"

    valid_runtimes = [float(r["runtime_seconds"]) for r in results if r.get("runtime_seconds") is not None]
    avg_runtime = sum(valid_runtimes) / len(valid_runtimes) if valid_runtimes else 0.0
    avg_runtime_str = f"{avg_runtime:.2f}s" if valid_runtimes else "?"

    max_att_str = next((str(r["max_attempts"]) for r in results if r.get("max_attempts") != "?"), "?")

    # Output file path: runs/{run_name}/{run_name}_eval_score.md (Markdown format)
    eval_score_file = os.path.join(run_dir, f"{run_name}_eval_score.md")
    with open(eval_score_file, "w", encoding="utf-8") as f:
        f.write(f"# 📊 Diff Evaluation Score Report: {run_name}\n\n")
        f.write("| Metric | Value |\n")
        f.write("| :--- | :--- |\n")
        f.write(f"| **Average Total Score** | **{avg_overall:.2f} / 6.00** |\n")
        f.write(f"| **Average Functional Parity** | **{avg_func:.2f} / 3.00** |\n")
        f.write(f"| **Average Production Quality** | **{avg_qual:.2f} / 3.00** |\n")
        f.write(f"| **Average Turns** | **{avg_turns_str}** |\n")
        f.write(f"| **Average Runtime** | **{avg_runtime_str}** |\n")
        f.write(f"| **Evaluated Test Cases** | **{len(results)}** |\n")
        if skipped_results:
            f.write(f"| **Skipped Non-OK Cases** | **{len(skipped_results)}** |\n")
        if max_att_str != "?":
            f.write(f"| **Max Attempts** | **{max_att_str}** |\n")
        f.write("\n---\n\n")

        f.write("## 🔍 Detailed Test Case Scores & Verdicts\n\n")
        f.write("| Status | Issue | Turns | Runtime | Func (0-3) | Qual (0-3) | Total (0-6) | Verdict & Quality Critique |\n")
        f.write("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n")
        for r in results:
            status_icon = "✅ PASS" if r.get("overall_score", 0) >= 4 else "❌ FAIL"
            attempts = r.get("attempts", "?")
            runtime_val = r.get("runtime_seconds")
            runtime_str = f"{runtime_val:.2f}s" if runtime_val is not None else "N/A"
            func_crit = str(r.get("functional_critique", "")).replace("|", "\\|").replace("\n", " ")
            qual_crit = str(r.get("quality_critique", "")).replace("|", "\\|").replace("\n", " ")
            critique_combined = f"**Func:** {func_crit} <br>**Qual:** {qual_crit}"
            
            # Extract clean issue number for table display
            issue_num = r.get("doc", {}).get("github_metadata", {}).get("issue_number")
            if not issue_num:
                parts = r["test_id"].split("_")
                for p in parts:
                    if p.isdigit():
                        issue_num = p
                        break
                if not issue_num:
                    issue_num = parts[-1]
            issue_label = f"#{issue_num}"
            f.write(f"| {status_icon} | `{issue_label}` | {attempts} | {runtime_str} | **{r.get('functional_score', 0)}/3** | **{r.get('quality_score', 0)}/3** | **{r.get('overall_score', 0)}/6** | {critique_combined} |\n")
        f.write("\n---\n\n")
        if skipped_results:
            f.write(f"*Omitted {len(skipped_results)} non-OK or no-spec test case(s) from judge scoring report.*\n\n")
        f.write("*Generated by LLM-as-a-Judge Diff Evaluator.*\n")

    print("\n==========================================================")
    print(f" Diff Evaluation Complete!")
    print(f" Average Total Score: {avg_overall:.2f} / 6.00 across {len(results)} evaluated test cases")
    if skipped_results:
        print(f" Skipped Non-OK:       {len(skipped_results)} test cases omitted")
    print(f" Average Turns:       {avg_turns_str}")
    print(f" Average Runtime:     {avg_runtime_str}")
    print(f" Score Report:        {eval_score_file}")
    print("==========================================================")
    return all_results


def main() -> None:
    """CLI entrypoint for standalone terminal invocation."""
    args = parse_args()
    run_diff_judge_eval(run_name=args.run_name, input_path=args.input_path, model=args.model)


if __name__ == "__main__":
    main()
