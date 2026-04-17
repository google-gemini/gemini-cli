#!/usr/bin/env python3
#
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
"""MCP bridge for exposing HATS framework capabilities as structured tools."""

from __future__ import annotations

import asyncio
import importlib
import inspect
import json
import os
from datetime import datetime, timezone
from typing import Any

from mcp.server.fastmcp import FastMCP


server = FastMCP("hats-mcp-server")


DEFAULT_FUNCTION_CANDIDATES: dict[str, list[str]] = {
    "port_scan": [
        "hats.recon.nmap:port_scan",
        "hats.recon.nmap:nmap_scan",
        "hats_framework.recon.nmap:port_scan",
        "hats_framework.recon.nmap:nmap_scan",
    ],
    "service_detection": [
        "hats.recon.services:service_detection",
        "hats.recon.services:detect_services",
        "hats_framework.recon.services:service_detection",
        "hats_framework.recon.services:detect_services",
    ],
    "vulnerability_lookup": [
        "hats.vuln.lookup:vulnerability_lookup",
        "hats.vuln.lookup:lookup_vulnerabilities",
        "hats_framework.vuln.lookup:vulnerability_lookup",
        "hats_framework.vuln.lookup:lookup_vulnerabilities",
    ],
}


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_function_candidates() -> dict[str, list[str]]:
    raw = os.getenv("HATS_FUNCTION_MAP", "")
    if not raw:
        return DEFAULT_FUNCTION_CANDIDATES

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError("HATS_FUNCTION_MAP must be valid JSON.") from error

    if not isinstance(parsed, dict):
        raise ValueError("HATS_FUNCTION_MAP must be a JSON object.")

    merged = dict(DEFAULT_FUNCTION_CANDIDATES)
    for key, value in parsed.items():
        if isinstance(value, str):
            merged[key] = [value]
        elif isinstance(value, list) and all(isinstance(item, str) for item in value):
            merged[key] = value
        else:
            raise ValueError(
                "HATS_FUNCTION_MAP values must be a function path string or a list of strings."
            )
    return merged


def _import_function(function_path: str):
    module_name, separator, function_name = function_path.partition(":")
    if not separator or not module_name or not function_name:
        raise ValueError(
            f"Invalid function path '{function_path}'. Use module.path:function_name format."
        )

    module = importlib.import_module(module_name)
    function = getattr(module, function_name)
    return function


def _coerce_to_json_compatible(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): _coerce_to_json_compatible(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_coerce_to_json_compatible(item) for item in value]
    if hasattr(value, "model_dump") and callable(value.model_dump):
        return _coerce_to_json_compatible(value.model_dump())
    if hasattr(value, "dict") and callable(value.dict):
        return _coerce_to_json_compatible(value.dict())
    return str(value)


async def _invoke_candidate(candidate: str, kwargs: dict[str, Any]) -> Any:
    function = _import_function(candidate)
    signature = inspect.signature(function)

    if any(param.kind == inspect.Parameter.VAR_KEYWORD for param in signature.parameters.values()):
        filtered_kwargs = kwargs
    else:
        allowed_keys = set(signature.parameters.keys())
        filtered_kwargs = {key: value for key, value in kwargs.items() if key in allowed_keys}

    result = function(**filtered_kwargs)
    if inspect.isawaitable(result):
        result = await result
    return result


async def _call_hats_function(tool_name: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    candidates = _load_function_candidates().get(tool_name, [])
    if not candidates:
        return {
            "tool": tool_name,
            "timestamp": _utc_timestamp(),
            "status": "error",
            "error": f"No function mapping configured for '{tool_name}'.",
            "hint": "Set HATS_FUNCTION_MAP to map tool names to Python functions.",
        }

    errors: list[dict[str, str]] = []
    for candidate in candidates:
        try:
            result = await _invoke_candidate(candidate, kwargs)
            return {
                "tool": tool_name,
                "timestamp": _utc_timestamp(),
                "status": "ok",
                "handler": candidate,
                "input": _coerce_to_json_compatible(kwargs),
                "findings": _coerce_to_json_compatible(result),
            }
        except Exception as error:
            errors.append({"handler": candidate, "error": str(error)})

    return {
        "tool": tool_name,
        "timestamp": _utc_timestamp(),
        "status": "error",
        "input": _coerce_to_json_compatible(kwargs),
        "error": "All configured HATS handlers failed.",
        "attempts": errors,
    }


@server.tool()
async def hats_port_scan(target: str, ports: str = "1-1000", timing: str = "T3") -> dict[str, Any]:
    """Run HATS-backed port reconnaissance and return structured JSON findings."""

    return await _call_hats_function(
        "port_scan",
        {
            "target": target,
            "ports": ports,
            "timing": timing,
        },
    )


@server.tool()
async def hats_service_detection(target: str, ports: str = "") -> dict[str, Any]:
    """Run HATS-backed service/version detection and return structured JSON findings."""

    return await _call_hats_function(
        "service_detection",
        {
            "target": target,
            "ports": ports,
        },
    )


@server.tool()
async def hats_vulnerability_lookup(target: str, services: list[str] | None = None) -> dict[str, Any]:
    """Run HATS-backed vulnerability lookup and return structured JSON findings."""

    return await _call_hats_function(
        "vulnerability_lookup",
        {
            "target": target,
            "services": services or [],
        },
    )


@server.tool()
async def hats_recon_chain(target: str, ports: str = "1-1000") -> dict[str, Any]:
    """Run the default cyber chain: ports -> service detection -> vulnerability lookup."""

    port_scan = await hats_port_scan(target=target, ports=ports)
    service_detection = await hats_service_detection(target=target, ports=ports)

    discovered_services: list[str] = []
    findings = service_detection.get("findings") if isinstance(service_detection, dict) else None
    if isinstance(findings, dict):
        raw_services = findings.get("services")
        if isinstance(raw_services, list):
            discovered_services = [str(item) for item in raw_services]

    vulnerability_lookup = await hats_vulnerability_lookup(
        target=target,
        services=discovered_services,
    )

    return {
        "tool": "recon_chain",
        "timestamp": _utc_timestamp(),
        "status": "ok",
        "target": target,
        "results": {
            "port_scan": port_scan,
            "service_detection": service_detection,
            "vulnerability_lookup": vulnerability_lookup,
        },
    }


def main() -> None:
    asyncio.run(server.run_stdio_async())


if __name__ == "__main__":
    main()
