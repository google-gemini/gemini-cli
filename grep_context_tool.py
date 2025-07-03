import re
from pathlib import Path
from check_file_permission import check_file_permission

def grep_context(file_path, pattern, context_lines, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    result = []
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        if re.search(pattern, line):
            start = max(0, i - context_lines)
            end = min(len(lines), i + context_lines + 1)
            result.extend(f"{file_path}:{j+1}:{lines[j].rstrip()}" for j in range(start, end))
    return "\n".join(result)