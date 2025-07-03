import re
from pathlib import Path
from check_file_permission import check_file_permission

def interactive_replace(file_path, pattern, replacement, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    new_content = re.sub(pattern, replacement, content)
    print(f"Preview:\nOld:\n{content}\nNew:\n{new_content}")
    if input("Apply changes? (y/n): ").lower() != "y":
        return "Changes cancelled"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return f"Applied changes to {file_path}"