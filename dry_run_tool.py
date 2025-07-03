import re
from pathlib import Path
from check_file_permission import check_file_permission

def dry_run_replace(file_path, pattern, replacement, config, regex=False):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    new_content = re.sub(pattern, replacement, content) if regex else content.replace(pattern, replacement)
    return f"[Dry Run] Would update {file_path}:\n{new_content}"