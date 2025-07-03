import re
from pathlib import Path
from check_file_permission import check_file_permission

def sed_replace(file_path, old_pattern, new_text, config, regex=False):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    if regex:
        new_content = re.sub(old_pattern, new_text, content)
    else:
        new_content = content.replace(old_pattern, new_text)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return f"Replaced text in {file_path}"