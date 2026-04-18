#!/usr/bin/env python3

import os
from pathlib import Path
import sys


def find_server_file(start: Path) -> Path:
    for parent in [start, *start.parents]:
        candidate = parent / "scripts" / "hats_mcp_server.py"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("Unable to locate scripts/hats_mcp_server.py")


def main() -> None:
    server_file = find_server_file(Path(__file__).resolve().parent)
    os.execv(sys.executable, [sys.executable, str(server_file), *sys.argv[1:]])


if __name__ == "__main__":
    main()
