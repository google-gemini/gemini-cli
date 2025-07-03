from pathlib import Path
import shutil
from check_file_permission import check_file_permission

def backup_file(file_path, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    backup_path = file_path.with_suffix(file_path.suffix + ".bak")
    shutil.copy(file_path, backup_path)
    return f"Created backup at {backup_path}"