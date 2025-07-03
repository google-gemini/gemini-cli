from pathlib import Path
import base64
from check_file_permission import check_file_permission

def base64_decode(file_path, output_path, config):
    if not check_file_permission(file_path, "read", config) or not check_file_permission(output_path, "write", config):
        raise PermissionError("Access denied for input or output")
    file_path, output_path = Path(file_path).resolve(), Path(output_path).resolve()
    with open(file_path, "r", encoding="utf-8") as f:
        content = base64.b64decode(f.read())
    with open(output_path, "wb") as f:
        f.write(content)
    return f"Decoded to {output_path}"