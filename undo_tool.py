from pathlib import Path
import shutil
from check_file_permission import check_file_permission

def undo_edit(file_path, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    undo_path = file_path.with_suffix(file_path.suffix + ".undo")
    if not undo_path.exists():
        raise ValueError(f"No undo available for {file_path}")
    shutil.move(undo_path, file_path)
    return f"Restored {file_path} from undo"