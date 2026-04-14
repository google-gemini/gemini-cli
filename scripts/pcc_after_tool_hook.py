#!/usr/bin/env python3
"""AfterTool hook adapter for pcc-critic."""

import json
import os
import pathlib
import subprocess
import sys
import time
from typing import Any


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
PCC_CRITIC = REPO_ROOT / "scripts" / "pcc-critic"


def build_evidence(payload: dict[str, Any]) -> str:
    tool_name = payload.get("tool_name", "unknown")
    tool_input = json.dumps(payload.get("tool_input", {}), ensure_ascii=False, indent=2)
    tool_response = json.dumps(payload.get("tool_response", {}), ensure_ascii=False, indent=2)
    return (
        "Review this tool execution evidence. Focus on concrete risks, weak validation, and likely follow-up checks. "
        "If the evidence looks acceptable, say so explicitly.\n\n"
        f"Tool: {tool_name}\n\n"
        f"Tool input:\n{tool_input}\n\n"
        f"Tool response:\n{tool_response}\n"
    )


def first_nonempty_line(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped[:240]
    return "No critique output returned."


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


def run_pcc(prompt_text: str, workspace_cwd: str) -> dict[str, Any]:
    runtime = os.environ.get("PCC_HOOK_RUNTIME", "audit-only")
    preset = os.environ.get("PCC_AFTER_TOOL_PRESET", "監")
    model = os.environ.get("PCC_HOOK_MODEL", "fast")
    config_path = resolve_config_path(workspace_cwd)
    timeout = int(os.environ.get("PCC_HOOK_TIMEOUT", "60"))
    python_bin = os.environ.get("PCC_CRITIC_PYTHON") or sys.executable

    command = [python_bin, str(PCC_CRITIC), "--json", "--preset", preset, "--timeout", str(timeout)]
    if config_path:
        command.extend(["--config", str(config_path)])
    if runtime == "audit-only":
        command.append("--audit-only")
    else:
        command.extend(["--runtime", runtime, "--model", model, "Critique this tool execution evidence."])

    result = subprocess.run(
        command,
        input=prompt_text,
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
    started = int(time.time())
    evidence = build_evidence(payload)

    try:
        result = run_pcc(evidence, payload["cwd"])
    except Exception as exc:  # pragma: no cover - hook safety fallback
        print(f"pcc_after_tool_hook failed: {exc}", file=sys.stderr)
        print(json.dumps({}))
        return

    destination = report_dir(payload)
    destination.mkdir(parents=True, exist_ok=True)
    report_path = destination / f"after-tool-{payload.get('tool_name', 'unknown')}-{started}.json"
    report = {
        "hook": "AfterTool",
        "tool_name": payload.get("tool_name"),
        "session_id": payload.get("session_id"),
        "timestamp": payload.get("timestamp"),
        "result": result,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    verdict = result.get("audit", {}).get("verdict", "UNKNOWN")
    summary = first_nonempty_line(result.get("response", ""))
    message = (
        f"PCC AfterTool critic verdict={verdict}. "
        f"Summary: {summary} "
        f"Report: {report_path.relative_to(pathlib.Path(payload['cwd']))}"
    )
    output = {
        "hookSpecificOutput": {
            "hookEventName": "AfterTool",
            "additionalContext": message,
        }
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
