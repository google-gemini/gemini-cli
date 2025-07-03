from pathlib import Path
import hashlib
from check_file_permission import check_file_permission

def hash_file(file_path, config, algorithm="sha256"):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    hasher = hashlib.new(algorithm)
    with open(file_path, "rb") as f:
        hasher.update(f.read())
    return hasher.hexdigest()