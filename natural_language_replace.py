import re
from pathlib import Path

def replace_natural_language(file_path, query, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    edit_map = {
        "replace _init_exchange method": (
            r"def _init_exchange\(self\)(.*?)(?=\n\s*def|\n\s*class|\Z)",
            "def _init_exchange(self):\n    self.exchange = BybitV5Plugin(self.cfg)"
        )
    }
    old_pattern, new_text = edit_map.get(query.lower(), (query, query))
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    pattern = re.compile(old_pattern, re.DOTALL)
    if not pattern.search(content):
        raise ValueError(f"Pattern for '{query}' not found in {file_path}")
    new_content = pattern.sub(new_text, content)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return f"Applied natural language replacement '{query}' in {file_path}"
