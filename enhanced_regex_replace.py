import re
from pathlib import Path

def replace_with_context(file_path, old_pattern, new_text, config, lookbehind=None, lookahead=None):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    pattern = old_pattern
    if lookbehind:
        pattern = f"(?<={re.escape(lookbehind)}){pattern}"
    if lookahead:
        pattern = f"{pattern}(?={re.escape(lookahead)})"
    pattern = re.compile(pattern, re.DOTALL)
    if not pattern.search(content):
        raise ValueError(f"Pattern '{old_pattern}' not found in {file_path}")
    new_content = pattern.sub(new_text, content)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return f"Replaced pattern with context in {file_path}"