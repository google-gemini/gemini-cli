from pathlib import Path
from check_file_permission import check_file_permission

def join_files(file1_path, file2_path, key_index, config):
    if not all(check_file_permission(f, "read", config) for f in [file1_path, file2_path]):
        raise PermissionError("Read access denied for one or more files")
    file1_path, file2_path = Path(file1_path).resolve(), Path(file2_path).resolve()
    with open(file1_path, "r", encoding="utf-8") as f1, open(file2_path, "r", encoding="utf-8") as f2:
        file1_lines = [line.strip().split() for line in f1]
        file2_lines = [line.strip().split() for line in f2]
    result = []
    for line1 in file1_lines:
        key1 = line1[key_index-1]
        for line2 in file2_lines:
            if line2[key_index-1] == key1:
                result.append(" ".join(line1 + line2))
    return "\n".join(result)