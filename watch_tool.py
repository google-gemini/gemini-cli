from pathlib import Path
import time
import os
from check_file_permission import check_file_permission

def watch_file(file_path, command, interval, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    last_mtime = file_path.stat().st_mtime
    while True:
        mtime = file_path.stat().st_mtime
        if mtime != last_mtime:
            os.system(command)
            last_mtime = mtime
        time.sleep(interval)