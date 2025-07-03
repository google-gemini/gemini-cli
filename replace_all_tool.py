import re
from pathlib import Path
from check_file_permission import check_file_permission

def replace_all(dir_path, pattern, replacement, config, regex=False):
    if not check_file_permission(dir_path, "write", config):
        raise PermissionError(f"Write access denied for {dir_path}")
    dir_path = Path(dir_path).resolve()
    results = []
    for file_path in dir_path.rglob("*"):
        if file_path.is_file() and check_file_permission(str(file_path), "write", config):
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            new_content = re.sub(pattern, replacement, content) if regex else content.replace(pattern, replacement)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            results.append(f"Updated {file_path}")
    return "\n".join(results)