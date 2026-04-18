#!/usr/bin/env python3

from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    server_file = repo_root / "scripts" / "hats_mcp_server.py"
    source = server_file.read_text(encoding="utf-8")
    exec(compile(source, str(server_file), "exec"), {"__name__": "__main__"})


if __name__ == "__main__":
    main()

