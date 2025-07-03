from pathlib import Path
import os
from check_file_permission import check_file_permission

def chmod_file(file_path, mode, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    os.chmod(file_path, int(mode, 8))
    return f"Changed permissions of {file_path} to {mode}"