import re
from pathlib import Path
from check_file_permission import check_file_permission

def awk_file(file_path, pattern, action, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    result = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            if re.search(pattern, line):
                result.append(action(line.strip()))
            else:
                result.append(line.strip())
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(result))
    return f"Processed {file_path} with awk"