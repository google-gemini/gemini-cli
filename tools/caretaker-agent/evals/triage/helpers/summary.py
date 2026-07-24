"""Run Evaluation Summary Calculator & Markdown Report Generator."""

import json
import datetime
from os import environ
from pathlib import Path
from typing import Dict, List, Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent.parent
RESULTS_DIR = BASE_DIR / "results"


class MarkdownBuilder:
    """Helper class for constructing safe, formatted Markdown reports."""

    def __init__(self):
        self.lines: List[str] = []

    def h3(self, text: str):
        self.lines.append(f"### {text}\n")

    def text(self, text: str):
        self.lines.append(f"{text}\n")

    def table(self, headers: List[str], rows: List[List[Any]]):
        self.lines.append("| " + " | ".join(headers) + " |")
        self.lines.append("| " + " | ".join([":---"] * len(headers)) + " |")
        for row in rows:
            escaped = [str(cell).replace("|", "\\|").replace("\n", " ") for cell in row]
            self.lines.append("| " + " | ".join(escaped) + " |")
        self.lines.append("")

    def details(self, summary_text: str, content: str):
        self.lines.append(f"<details>\n<summary>{summary_text}</summary>\n\n{content}\n\n</details>\n")

    def render(self) -> str:
        return "\n".join(self.lines)


def init_dir(save: bool = True) -> str:
    """Creates run output directory and sets up logging environment variables."""
    if save:
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = RESULTS_DIR / "runs" / f"run_{timestamp_str}"
    else:
        run_dir = RESULTS_DIR / "runs" / "run_temp"
        if run_dir.exists():
            import shutil
            shutil.rmtree(run_dir)

    issues_dir = run_dir / "issues"
    issues_dir.mkdir(parents=True, exist_ok=True)
    environ["GCS_LOGGING"] = "LOCAL"
    environ["LOCAL_LOG_DIR"] = str(issues_dir)
    return str(run_dir)


def save_issue_result(issues_dir: Path, issue_num: int, record: Dict[str, Any]) -> None:
    """Saves individual issue evaluation result JSON file to disk."""
    file_path = Path(issues_dir) / f"gemini_cli_{issue_num}.json"
    file_path.write_text(json.dumps(record, indent=2), encoding="utf-8")


def _save_run_summary(run_summary: Dict[str, Any], run_dir: str) -> None:
    """Saves structured suite summary evaluation result to run_dir/summary.json."""
    (Path(run_dir) / "summary.json").write_text(json.dumps(run_summary, indent=2), encoding="utf-8")


def _write_markdown(run_summary: Dict[str, Any], results: List[Dict[str, Any]], filepath: str) -> None:
    """Writes formatted markdown summary report using MarkdownBuilder helper."""
    doc = MarkdownBuilder()
    doc.h3("📊 Triage Evaluation Summary")

    note = run_summary.get("note")
    if note:
        doc.text(f"**Run Note:** {note}")

    total_tested = run_summary.get("total_tested", 0)
    total_attempted = run_summary.get("total_attempted", 0)
    total_failed = run_summary.get("total_failed", 0)
    doc.text(f"**Run Stats:** {total_tested}/{total_attempted} passed, {total_failed} failed/crashed.")

    quality_match_pct = run_summary.get("quality_categorization_rate", 0) * 100
    effort_match_pct = run_summary.get("effort_categorization_rate", 0) * 100

    autoclose_recall_pct = run_summary.get("autoclose_recall_rate", 0) * 100
    autoclose_correct_count = run_summary.get("correct_autoclose_count", 0)
    autoclose_expected_count = run_summary.get("expected_autoclose_count", 0)

    valid_kept_open_pct = run_summary.get("valid_kept_open_rate", 0) * 100
    valid_kept_open_count = run_summary.get("valid_kept_open_count", 0)
    valid_kept_open_expected = run_summary.get("expected_active_count", 0)

    workable_spec_count = run_summary.get("workable_spec_count", 0)
    workable_spec_pass_rate = run_summary.get("avg_workable_spec_pass_rate_pct", 0)
    avg_execution_time_seconds = run_summary.get("avg_execution_time_seconds", 0)

    summary_rows = [
        [
            "**Quality Categorization Match**",
            f"{int(total_tested * quality_match_pct / 100)}/{total_tested}",
            f"**{quality_match_pct:.1f}%**"
        ],
        [
            "**Effort Categorization Match**",
            f"{int(total_tested * effort_match_pct / 100)}/{total_tested}",
            f"**{effort_match_pct:.1f}%**"
        ],
    ]
    if autoclose_expected_count > 0:
        summary_rows.append([
            "**Auto-Close Match (Recall)**",
            f"{autoclose_correct_count}/{autoclose_expected_count}",
            f"**{autoclose_recall_pct:.1f}%**"
        ])
    if valid_kept_open_expected > 0:
        summary_rows.append([
            "**Valid Issues Kept Open**",
            f"{valid_kept_open_count}/{valid_kept_open_expected}",
            f"**{valid_kept_open_pct:.1f}%**"
        ])
    if workable_spec_count > 0:
        summary_rows.append([
            "**Workable Spec Pass Rate**",
            f"{workable_spec_count} specs evaluated",
            f"**{workable_spec_pass_rate:.1f}%**"
        ])
    summary_rows.append([
        "**Avg Execution Time**",
        "-",
        f"**{avg_execution_time_seconds:.2f}s**"
    ])

    doc.table(["Metric", "Result", "Score"], summary_rows)

    failures = run_summary.get("failures", [])
    if failures:
        doc.h3("❌ Failed / Crashed Issues")
        fail_rows = [
            [f"#{f['issue_number']}", f"`{' '.join(str(f.get('error', '')).split())[:80]}`"]
            for f in failures
        ]
        doc.table(["Issue", "Error Message"], fail_rows)
        failed_ids_str = ",".join(str(f['issue_number']) for f in failures)
        doc.text(f"**📋 Copy-paste to retry failed issues (paste into `issues` input):**\n```text\n{failed_ids_str}\n```")

    if results:
        doc.h3("📋 Detailed Issue Evaluation Results")
        table_builder = MarkdownBuilder()
        detail_rows = []

        for r in results:
            issue_num = r.get("issue_number")
            title = (r.get("title") or "")[:45]
            t_ver = str(r.get("target_version", "N/A"))[:7]
            a_ver = str(r.get("actual_version", "N/A"))[:7]
            ver_str = f"{t_ver} → {a_ver}" if t_ver == a_ver else f"{t_ver} → {a_ver} ❌"

            if "error" in r:
                clean_err = " ".join(str(r.get("error", "")).split())[:35]
                detail_rows.append([f"#{issue_num}", title, ver_str, f"CRASHED ({clean_err}...)", "-", "-", "-"])
                continue

            cat_eval = r.get("categorization", {})
            spec_grade = r.get("judge_evaluation", {})

            exp_q = r.get("expected", {}).get("quality", "")
            pred_q = cat_eval.get("predicted_quality", "")
            q_icon = "" if cat_eval.get("quality_match") else " ❌"
            quality_str = f"{exp_q} → {pred_q}{q_icon}"

            exp_e = r.get("expected", {}).get("effort", "")
            pred_e = cat_eval.get("predicted_effort", "")
            effort_str = f"{exp_e} → {pred_e}" + ("" if cat_eval.get("effort_match") else " ❌") if exp_q == "OK" else "-"

            spec_score_val = spec_grade.get("spec_score_pct", "")
            spec_score_str = f"{spec_score_val}%" if spec_score_val != "" else "-"

            reasons = spec_grade.get("reasoning", {})
            if isinstance(reasons, dict) and reasons:
                lines = [f"<b>{k}</b>: {str(v).replace('|', '\\|').replace('\n', ' ')}" for k, v in reasons.items()]
                critique = f"<small>{'<br>'.join(lines)}</small>"
            else:
                critique = "-"

            detail_rows.append([f"#{issue_num}", title, ver_str, quality_str, effort_str, spec_score_str, critique])

        table_headers = ["Issue", "Title", "Version (Target → Actual)", "Quality (Exp → Pred)", "Effort (Exp → Pred)", "Spec Score", "Judge Critique"]
        table_builder.table(table_headers, detail_rows)
        doc.details("🔍 Click to expand detailed issue-by-issue results", table_builder.render())

    doc.text("---\n📊 **GCS Storage Destination:** [gs://triage-eval-results/runs/](https://console.cloud.google.com/storage/browser/triage-eval-results/runs?project=gcli-intern-project-2026)\n\n📥 **View & Download Scorecards:** Click the link above to view or download full JSON run artifacts directly in Google Cloud Console.\n\n*Generated by Triage Eval Runner.*")

    target_path = Path(filepath)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(doc.render(), encoding="utf-8")


def calc_summary(
    run_dir: str,
    note: Optional[str],
    start_timestamp: str,
    end_timestamp: str
) -> Dict[str, Any]:
    """Calculates evaluation metrics from results persisted in run_dir/issues/, prints summary report, and saves it."""
    issues_dir = Path(run_dir) / "issues"
    results = []

    if not issues_dir.exists():
        print(f"❌ Run issues directory not found: {issues_dir}")
        return {}

    issue_files = [f for f in sorted(issues_dir.glob("gemini_cli_*.json")) if "debug" not in f.name]
    for file_path in issue_files:
        try:
            results.append(json.loads(file_path.read_text(encoding="utf-8")))
        except Exception as e:
            print(f"❌ Error reading {file_path} during summary generation: {e}")

    successful_results = [r for r in results if "error" not in r]
    failed_results = [r for r in results if "error" in r]

    total_attempted = len(results)
    total_tested = len(successful_results)
    total_failed = len(failed_results)

    AUTOCLOSE_TYPES = {"SPAM", "EMPTY", "FEATURE"}
    total_quality_matches = 0
    total_effort_matches = 0
    total_expected_autoclose = 0
    correct_autoclose = 0
    predicted_autoclose = 0

    for r in successful_results:
        cat = r.get("categorization", {})
        expected = r.get("expected", {})

        if cat.get("quality_match"):
            total_quality_matches += 1
        if cat.get("effort_match"):
            total_effort_matches += 1

        exp_quality = expected.get("quality")
        pred_quality = cat.get("predicted_quality")

        if exp_quality in AUTOCLOSE_TYPES:
            total_expected_autoclose += 1
            if pred_quality in AUTOCLOSE_TYPES:
                correct_autoclose += 1
        if pred_quality in AUTOCLOSE_TYPES:
            predicted_autoclose += 1

    total_expected_active = total_tested - total_expected_autoclose
    false_autoclose = predicted_autoclose - correct_autoclose
    valid_kept_open = total_expected_active - false_autoclose

    spec_pass_rates = [
        r.get("judge_evaluation", {}).get("spec_score_pct")
        for r in successful_results
        if r.get("judge_evaluation") and "spec_score_pct" in r.get("judge_evaluation", {})
    ]
    execution_times = [r.get("execution_time_seconds", 0.0) for r in successful_results]

    avg_spec_pass_rate = round(sum(spec_pass_rates) / len(spec_pass_rates), 1) if spec_pass_rates else 0.0
    avg_exec_time = round(sum(execution_times) / len(execution_times), 2) if execution_times else 0.0

    run_summary = {
        "start_timestamp": start_timestamp,
        "end_timestamp": end_timestamp,
        "note": note or "",
        "total_attempted": total_attempted,
        "total_tested": total_tested,
        "total_failed": total_failed,
        "failures": [
            {"issue_number": r.get("issue_number"), "error": r.get("error")}
            for r in failed_results
        ],
        "workable_spec_count": len(spec_pass_rates),
        "quality_categorization_rate": total_quality_matches / total_tested if total_tested else 0,
        "effort_categorization_rate": total_effort_matches / total_tested if total_tested else 0,
        "expected_autoclose_count": total_expected_autoclose,
        "correct_autoclose_count": correct_autoclose,
        "autoclose_recall_rate": correct_autoclose / total_expected_autoclose if total_expected_autoclose else 0,
        "expected_active_count": total_expected_active,
        "valid_kept_open_count": valid_kept_open,
        "valid_kept_open_rate": valid_kept_open / total_expected_active if total_expected_active else 0,
        "avg_workable_spec_pass_rate_pct": avg_spec_pass_rate,
        "avg_execution_time_seconds": avg_exec_time
    }

    if total_failed > 0:
        failed_ids_str = ",".join(str(r.get("issue_number")) for r in failed_results if r.get("issue_number") is not None)
        print(f"\n⚠️ Evaluation completed with {total_failed} execution error(s) ({total_tested}/{total_attempted} executed successfully).")
        print(f"Failed Issue IDs to Retry: {failed_ids_str}")
    else:
        print(f"\n✅ Evaluation execution completed successfully! ({total_tested}/{total_attempted} executed without error)")

    _save_run_summary(run_summary, run_dir)
    print(f"📁 Saved structured run results to: {run_dir}/\n")

    # Write markdown summary report to run_dir/summary.md and latest_summary.md
    md_filepath = Path(run_dir) / "summary.md"
    _write_markdown(run_summary, results, str(md_filepath))

    latest_md_filepath = PROJECT_ROOT / "evals" / "triage" / "results" / "latest_summary.md"
    _write_markdown(run_summary, results, str(latest_md_filepath))

    return run_summary
