import re
from pathlib import Path
from check_file_permission import check_file_permission

def sed_append(file_path, pattern, content, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    new_lines = []
    for line in lines:
        new_lines.append(line)
        if re.search(pattern, line):
            new_lines.append(content + "\n")
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    return f"Appended after pattern in {file_path}"
