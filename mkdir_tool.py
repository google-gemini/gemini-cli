from pathlib import Path
from check_file_permission import check_file_permission

def mkdir_dir(dir_path, config):
    if not check_file_permission(dir_path, "write", config):
        raise PermissionError(f"Write access denied for {dir_path}")
    dir_path = Path(dir_path).resolve()
    dir_path.mkdir(parents=True, exist_ok=True)
    return f"Created directory {dir_path}"