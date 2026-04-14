#!/usr/bin/env python3
"""SessionEnd hook adapter for pcc-critic."""

import json
import os
import pathlib
import subprocess
import sys
import time
from typing import Any


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
PCC_CRITIC = REPO_ROOT / "scripts" / "pcc-critic"


def load_transcript(payload: dict[str, Any]) -> str:
    transcript_path = pathlib.Path(payload["transcript_path"])
    limit = int(os.environ.get("PCC_SESSION_END_MAX_CHARS", "50000"))
    if not transcript_path.exists():
        return "Transcript file not found."
    text = transcript_path.read_text(encoding="utf-8", errors="replace")
    return text[-limit:]


def report_dir(payload: dict[str, Any]) -> pathlib.Path:
    configured = os.environ.get("PCC_REPORT_DIR")
    if configured:
        return pathlib.Path(configured)
    return pathlib.Path(payload["cwd"]) / ".gemini" / "pcc-reports"


def resolve_config_path(workspace_cwd: str) -> pathlib.Path | None:
    configured = os.environ.get("PCC_CRITIC_CONFIG_PATH")
    if not configured:
        return None
    path = pathlib.Path(configured).expanduser()
    if not path.is_absolute():
        path = pathlib.Path(workspace_cwd) / path
    return path


def run_pcc(transcript_text: str, workspace_cwd: str) -> dict[str, Any]:
    runtime = os.environ.get("PCC_HOOK_RUNTIME", "audit-only")
    preset = os.environ.get("PCC_SESSION_END_PRESET", "監")
    model = os.environ.get("PCC_HOOK_MODEL", "fast")
    config_path = resolve_config_path(workspace_cwd)
    timeout = int(os.environ.get("PCC_HOOK_TIMEOUT", "90"))
    python_bin = os.environ.get("PCC_CRITIC_PYTHON") or sys.executable

    command = [python_bin, str(PCC_CRITIC), "--json", "--preset", preset, "--timeout", str(timeout)]
    if config_path:
        command.extend(["--config", str(config_path)])
    if runtime == "audit-only":
        command.append("--audit-only")
    else:
        command.extend(
            [
                "--runtime",
                runtime,
                "--model",
                model,
                "Audit this Gemini CLI session transcript with evidence-first judgment.",
            ]
        )

    result = subprocess.run(
        command,
        input=transcript_text,
        text=True,
        capture_output=True,
        cwd=str(REPO_ROOT),
        timeout=timeout,
    )
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)

    if not result.stdout.strip():
        return {
            "mode": runtime,
            "error": "empty-output",
            "exit_code": result.returncode,
            "response": "",
            "audit": {
                "verdict": "NO_OP",
                "sycophancy": 0.0,
                "evidence_count": 0,
                "words": 0,
            },
        }

    parsed = json.loads(result.stdout)
    if isinstance(parsed, dict) and "audit" not in parsed and "verdict" in parsed:
        return {
            "mode": runtime,
            "response": "",
            "exit_code": result.returncode,
            "audit": parsed,
        }
    return parsed


def main() -> None:
    payload = json.load(sys.stdin)
    transcript_text = load_transcript(payload)
    started = int(time.time())

    try:
        result = run_pcc(transcript_text, payload["cwd"])
    except Exception as exc:  # pragma: no cover - hook safety fallback
        print(f"pcc_session_end_hook failed: {exc}", file=sys.stderr)
        print(json.dumps({}))
        return

    destination = report_dir(payload)
    destination.mkdir(parents=True, exist_ok=True)
    report_path = destination / f"session-end-{payload.get('session_id', 'unknown')}-{started}.json"
    report = {
        "hook": "SessionEnd",
        "reason": payload.get("reason"),
        "session_id": payload.get("session_id"),
        "timestamp": payload.get("timestamp"),
        "transcript_path": payload.get("transcript_path"),
        "result": result,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({}))


if __name__ == "__main__":
    main()
