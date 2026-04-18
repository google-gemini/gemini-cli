#!/usr/bin/env python3

import os
from pathlib import Path
import sys


def find_server_file(start: Path) -> Path:
    for parent in [start, *start.parents]:
        candidate = parent / "scripts" / "hats_mcp_server.py"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"Unable to locate scripts/hats_mcp_server.py from start path: {start}"
    )


def main() -> None:
    server_file = find_server_file(Path(__file__).resolve().parent)
    # Intentionally replace this wrapper process so MCP stdio uses the main server process directly.
    os.execv(sys.executable, [sys.executable, str(server_file)])


if __name__ == "__main__":
    main()
