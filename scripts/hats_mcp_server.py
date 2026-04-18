#!/usr/bin/env python3
"""
HATS MCP Server for Gemini-Cyber-CLI.

Bridges Gemini tools to the Python-based HATS framework and returns
structured JSON-compatible objects.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from typing import Any


def _import_fastmcp():
    try:
        from fastmcp import FastMCP  # type: ignore

        return FastMCP
    except Exception:
        try:
            from mcp.server.fastmcp import FastMCP  # type: ignore

            return FastMCP
        except Exception as exc:  # pragma: no cover - startup failure path
            raise RuntimeError(
                "FastMCP is required. Install with: pip install fastmcp"
            ) from exc


FastMCP = _import_fastmcp()
mcp = FastMCP("hats-mcp-server")


def _run_hats(args: list[str]) -> dict[str, Any]:
    hats_bin = os.getenv("HATS_BIN", "hats")
    timeout_seconds = int(os.getenv("HATS_TIMEOUT_SECONDS", "120"))
    command = [hats_bin, *args]

    proc = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    parsed_json: Any = None
    if stdout:
        try:
            parsed_json = json.loads(stdout)
        except Exception:
            parsed_json = None

    return {
        "command": " ".join(shlex.quote(part) for part in command),
        "return_code": proc.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "parsed_json": parsed_json,
        "success": proc.returncode == 0,
    }


@mcp.tool()
def hats_nmap_scan(target: str, ports: str = "top-100") -> dict[str, Any]:
    """Run HATS nmap scan for an authorized target."""
    return _run_hats(["scan", "nmap", "--target", target, "--ports", ports])


@mcp.tool()
def hats_service_detection(target: str, ports: str = "") -> dict[str, Any]:
    """Run HATS service detection for an authorized target."""
    args = ["scan", "services", "--target", target]
    if ports:
        args.extend(["--ports", ports])
    return _run_hats(args)


@mcp.tool()
def hats_vuln_lookup(service: str, version: str = "") -> dict[str, Any]:
    """Run HATS vulnerability lookup for a discovered service/version."""
    args = ["lookup", "vuln", "--service", service]
    if version:
        args.extend(["--version", version])
    return _run_hats(args)


@mcp.tool()
def hats_chain_scan(target: str) -> dict[str, Any]:
    """Execute chained recon: nmap -> service detection -> vulnerability lookup."""
    nmap_result = hats_nmap_scan(target)
    service_result = hats_service_detection(target)

    return {
        "target": target,
        "chain": {
            "nmap": nmap_result,
            "service_detection": service_result,
        },
        "next_step": "Use hats_vuln_lookup for each discovered service/version.",
    }


if __name__ == "__main__":
    mcp.run()
