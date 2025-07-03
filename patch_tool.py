from pathlib import Path
import difflib
from check_file_permission import check_file_permission

def patch_file(file_path, patch_content, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    patched_lines = difflib.restore(patch_content.splitlines(), 1)
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(patched_lines)
    return f"Applied patch to {file_path}"