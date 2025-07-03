import re
from pathlib import Path

def replace_interactive(file_path, old_pattern, new_text, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    pattern = re.compile(old_pattern, re.DOTALL)
    matches = pattern.findall(content)
    if not matches:
        raise ValueError(f"Pattern '{old_pattern}' not found in {file_path}")
    print(f"Preview:
Old:
{matches[0]}
New:
{new_text}")
    confirm = input("Apply replacement? (y/n): ").lower()
    if confirm != "y":
        return "Replacement cancelled"
    new_content = pattern.sub(new_text, content)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return f"Applied interactive replacement in {file_path}"