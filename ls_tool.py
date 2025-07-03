from pathlib import Path
from check_file_permission import check_file_permission

def ls_dir(dir_path, config):
    if not check_file_permission(dir_path, "read", config):
        raise PermissionError(f"Read access denied for {dir_path}")
    dir_path = Path(dir_path).resolve()
    if not dir_path.is_dir():
        raise ValueError(f"Directory not found: {dir_path}")
    return "\n".join(str(p) for p in dir_path.iterdir())