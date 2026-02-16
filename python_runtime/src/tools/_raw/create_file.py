# python_runtime/src/tools/_raw/create_file.py
# The Hand: Raw capabilities with no conscience.

import os
import pathlib

def create_file_raw(path: str, content: str) -> None:
    """
    Mechanical execution of file creation.
    No audit, no justification, just IO.
    """
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
