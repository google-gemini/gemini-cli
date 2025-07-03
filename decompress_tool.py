from pathlib import Path
import zipfile
from check_file_permission import check_file_permission

def decompress_files(zip_path, extract_path, config):
    if not check_file_permission(zip_path, "read", config):
        raise PermissionError(f"Read access denied for {zip_path}")
    zip_path, extract_path = Path(zip_path).resolve(), Path(extract_path).resolve()
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_path)
    return f"Extracted to {extract_path}"