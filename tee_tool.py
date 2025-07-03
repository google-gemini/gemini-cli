from pathlib import Path
from check_file_permission import check_file_permission

def tee_file(file_path, content, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return content