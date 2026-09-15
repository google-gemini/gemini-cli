"""
Cloud Run Job Entrypoint for Gemini CLI Triage Evaluation Suite.
Reads EVAL_CONFIG JSON environment variable, invokes run_suite(), and syncs results to GCS.
"""

import os
import json
from evals.triage.runner import run_suite
from evals.triage.helpers.sync_to_gcs import sync_results_to_gcs


def main() -> None:
    config_str = os.environ.get("EVAL_CONFIG", "{}")
    try:
        cfg = json.loads(config_str) if config_str else {}
        if not isinstance(cfg, dict):
            raise ValueError(f"EVAL_CONFIG must be a JSON object, got {type(cfg).__name__}")
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid EVAL_CONFIG JSON: {e}") from e

    print("========================================================")
    print(" 🚀 Running Gemini CLI Triage Evaluation Suite (Cloud Run)")
    print("========================================================")
    if cfg:
        print(f"[EVAL_CONFIG] Loaded configuration: {cfg}")

    # 1. Execute benchmark suite directly via run_suite()
    run_suite(
        filter_issues=cfg.get("issues"),
        concurrency=cfg.get("concurrency", 5),
        note=cfg.get("note")
    )

    # 2. Sync evaluation run results to GCS bucket
    sync_results_to_gcs()


if __name__ == "__main__":
    main()
