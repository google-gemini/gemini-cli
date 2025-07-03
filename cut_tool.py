from pathlib import Path
from check_file_permission import check_file_permission

def cut_file(file_path, delimiter, fields, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    result = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split(delimiter)
            selected = [parts[i-1] for i in fields if i <= len(parts)]
            result.append(delimiter.join(selected))
    return "\n".join(result)