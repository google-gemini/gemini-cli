from pathlib import Path
import zipfile
from check_file_permission import check_file_permission

def compress_files(file_paths, zip_path, config):
    if not check_file_permission(zip_path, "write", config):
        raise PermissionError(f"Write access denied for {zip_path}")
    zip_path = Path(zip_path).resolve()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in file_paths:
            if not check_file_permission(file_path, "read", config):
                raise PermissionError(f"Read access denied for {file_path}")
            file_path = Path(file_path).resolve()
            zf.write(file_path, file_path.name)
    return f"Compressed to {zip_path}"