from pathlib import Path
from check_file_permission import check_file_permission

def paste_files(file_paths, config):
    if not all(check_file_permission(f, "read", config) for f in file_paths):
        raise PermissionError("Read access denied for one or more files")
    result = []
    files = [Path(f).resolve().open("r", encoding="utf-8") for f in file_paths]
    while True:
        lines = []
        for f in files:
            line = f.readline().strip()
            if not line:
                return "\n".join(result)
            lines.append(line)
        result.append("\t".join(lines))

