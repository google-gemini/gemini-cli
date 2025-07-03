import shutil
from pathlib import Path
import re

def replace_with_backup(file_path, old_pattern, new_text, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    backup_path = file_path.with_suffix(file_path.suffix + ".bak")
    shutil.copy(file_path, backup_path)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        pattern = re.compile(old_pattern, re.DOTALL)
        if not pattern.search(content):
            raise ValueError(f"Pattern '{old_pattern}' not found in {file_path}")
        new_content = pattern.sub(new_text, content)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        return f"Replaced pattern in {file_path}, backup at {backup_path}"
    except Exception as e:
        shutil.copy(backup_path, file_path)
        raise ValueError(f"Edit failed, restored backup: {str(e)}")

def replace_rollback(file_path, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    backup_path = file_path.with_suffix(file_path.suffix + ".bak")
    if not backup_path.exists():
        raise ValueError(f"No backup found for {file_path}")
    shutil.copy(backup_path, file_path)
    return f"Restored {file_path} from backup"