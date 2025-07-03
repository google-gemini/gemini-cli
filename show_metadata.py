from pathlib import Path
import datetime

def show_metadata(file_path, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    stat = file_path.stat()
    size = stat.st_size
    mtime = datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
    return f"File: {file_path}\nSize: {size} bytes\nModified: {mtime}"