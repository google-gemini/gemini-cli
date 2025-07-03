from pathlib import Path
from check_file_permission import check_file_permission

def split_file(file_path, lines_per_file, prefix, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    for i in range(0, len(lines), lines_per_file):
        output_path = file_path.parent / f"{prefix}{i//lines_per_file}.txt"
        with open(output_path, "w", encoding="utf-8") as f:
            f.writelines(lines[i:i+lines_per_file])
    return f"Split {file_path} into {len(lines)//lines_per_file + 1} files"