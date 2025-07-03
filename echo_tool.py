from pathlib import Path
from check_file_permission import check_file_permission

def echo_text(text, file_path, config, append=False):
    if file_path:
        if not check_file_permission(file_path, "write", config):
            raise PermissionError(f"Write access denied for {file_path}")
        file_path = Path(file_path).resolve()
        mode = "a" if append else "w"
        with open(file_path, mode, encoding="utf-8") as f:
            f.write(text + "\n")
        return f"Wrote to {file_path}"
    return text