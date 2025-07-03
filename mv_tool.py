from pathlib import Path
import shutil
from check_file_permission import check_file_permission

def mv_file(src_path, dst_path, config):
    if not check_file_permission(src_path, "write", config) or not check_file_permission(dst_path, "write", config):
        raise PermissionError("Access denied for source or destination")
    src_path, dst_path = Path(src_path).resolve(), Path(dst_path).resolve()
    if not src_path.is_file():
        raise ValueError(f"Source file not found: {src_path}")
    shutil.move(src_path, dst_path)
    return f"Moved {src_path} to {dst_path}"