from pathlib import Path
from check_file_permission import check_file_permission

def wc_file(file_path, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    lines = len(content.splitlines())
    words = len(content.split())
    chars = len(content)
    return f"{lines} {words} {chars} {file_path}"