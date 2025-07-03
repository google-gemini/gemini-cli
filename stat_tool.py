from pathlib import Path
import datetime
from check_file_permission import check_file_permission

def stat_file(file_path, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.exists():
        raise ValueError(f"File not found: {file_path}")
    stat = file_path.stat()
    return (f"File: {file_path}\nSize: {stat.st_size} bytes\n"\
            f"Modified: {datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()}")