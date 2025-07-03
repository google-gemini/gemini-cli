from pathlib import Path
import difflib
from check_file_permission import check_file_permission

def diff_files(file1_path, file2_path, config):
    if not all(check_file_permission(f, "read", config) for f in [file1_path, file2_path]):
        raise PermissionError("Read access denied for one or more files")
    file1_path, file2_path = Path(file1_path).resolve(), Path(file2_path).resolve()
    if not all(f.is_file() for f in [file1_path, file2_path]):
        raise ValueError("One or more files not found")
    with open(file1_path, "r", encoding="utf-8") as f1, open(file2_path, "r", encoding="utf-8") as f2:
        diff = difflib.unified_diff(f1.readlines(), f2.readlines(), str(file1_path), str(file2_path))
    return "".join(diff)