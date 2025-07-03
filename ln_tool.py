from pathlib import Path
from check_file_permission import check_file_permission

def ln_file(src_path, link_path, config):
    if not check_file_permission(src_path, "read", config) or not check_file_permission(link_path, "write", config):
        raise PermissionError("Access denied for source or link")
    src_path, link_path = Path(src_path).resolve(), Path(link_path)
    link_path.symlink_to(src_path)
    return f"Created symlink {link_path} to {src_path}"