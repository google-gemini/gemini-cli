"""
Golden Dataset Quality & Effort Metrics Diagnostic CLI Tool.

CLI Usage:
  python3 -m evals.triage.tools.dataset_metrics
"""

from collections import Counter
from evals.triage.helpers.dataset import load_issues

VALID_QUALITIES = ["OK", "SPAM", "EMPTY", "NEEDS_INFO", "FEATURE"]
VALID_EFFORTS = ["SMALL", "MEDIUM", "LARGE"]


def _validate_spec_integrity(issues) -> bool:
    """
    Validation helper that enforces spec & metadata integrity across the dataset:
    - Quality MUST be one of: OK, SPAM, EMPTY, NEEDS_INFO, FEATURE.
    - OK issues MUST have a valid workable spec and effort estimate (SMALL, MEDIUM, LARGE).
    - Non-OK issues MUST NOT have a workable spec and MUST have an empty effort string ("").
    Prints ONLY the specific issues causing errors (if any).
    """
    errors = []
    for data in issues:
        issue_num = data.get("issue_number", 0)
        quality = data.get("expected_quality", "")
        effort = data.get("expected_effort", "")
        spec = data.get("expected_workable_spec", {})
        has_spec = bool(spec and isinstance(spec, dict) and len(spec) > 0)

        # 1. Quality validity check
        if quality not in VALID_QUALITIES:
            errors.append(f"  ❌ Issue #{issue_num}: Quality '{quality}' is invalid! Must be one of: {VALID_QUALITIES}")

        # 2. Spec & Effort checks
        if quality == "OK":
            if not has_spec:
                errors.append(f"  ❌ Issue #{issue_num}: Quality is 'OK' but missing workable spec!")
            elif not (isinstance(spec, dict) and spec.get("summary") and spec.get("implementation_plan")):
                errors.append(f"  ❌ Issue #{issue_num}: Quality is 'OK' but workable spec structure is incomplete!")

            if effort not in VALID_EFFORTS:
                errors.append(f"  ❌ Issue #{issue_num}: Quality is 'OK' but effort '{effort}' is invalid! Must be one of: {VALID_EFFORTS}")
        else:
            if has_spec:
                errors.append(f"  ❌ Issue #{issue_num}: Quality is '{quality}' but has unexpected workable spec content: {spec}")
            if effort != "":
                errors.append(f"  ❌ Issue #{issue_num}: Quality is '{quality}' but has non-empty effort estimate ('{effort}')!")

    if errors:
        print("\n--- ⚠️ Spec & Metadata Validation Errors ---")
        for err in errors:
            print(err)
        return False
    else:
        print("\n  ✅ Spec & Metadata Integrity Check: All issues correctly configured.")
        return True


def compute_metrics() -> bool:
    issues = load_issues()
    total_issues = len(issues)

    if total_issues == 0:
        print("[METRICS] No golden issues found in Firestore.")
        return True

    qualities = Counter()
    ok_efforts = Counter()

    for data in issues:
        quality = data.get("expected_quality", "")
        effort = data.get("expected_effort", "")

        qualities[quality] += 1
        if quality == "OK":
            ok_efforts[effort] += 1

    print("\n" + "=" * 70)
    print(" 📊 GOLDEN DATASET DIAGNOSTIC REPORT (Firestore)")
    print("=" * 70)
    print(f"📦 Total Golden Issues: {total_issues}")

    print("\n--- 🏷️ Expected Quality Breakdown ---")
    for q in VALID_QUALITIES:
        count = qualities.get(q, 0)
        pct = (count / total_issues * 100) if total_issues else 0
        bar = "█" * count
        print(f"  {q:<12}: {count:>2} ({pct:>5.1f}%)  {bar}")

    ok_count = qualities.get("OK", 0)
    print(f"\n--- ⚡ Expected Effort Breakdown (For {ok_count} OK Issues) ---")
    for e in VALID_EFFORTS:
        count = ok_efforts.get(e, 0)
        pct = (count / ok_count * 100) if ok_count else 0
        bar = "█" * count
        print(f"  {e:<12}: {count:>2} ({pct:>5.1f}%)  {bar}")

    # Run clean Spec & Metadata Integrity Check
    success = _validate_spec_integrity(issues)

    print("=" * 70 + "\n")
    return success


def main():
    import sys
    if not compute_metrics():
        sys.exit(1)


if __name__ == "__main__":
    main()
