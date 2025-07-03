from pathlib import Path
from check_file_permission import check_file_permission

def cat_files(file_paths, config):
    if not all(check_file_permission(f, "read", config) for f in file_paths):
        raise PermissionError("Read access denied for one or more files")
    result = []
    for file_path in file_paths:
        file_path = Path(file_path).resolve()
        if not file_path.is_file():
            raise ValueError(f"File not found: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            result.append(f.read())
    return "\n".join(result)