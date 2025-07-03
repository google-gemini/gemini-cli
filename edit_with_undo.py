from pathlib import Path
import shutil

def edit_with_undo(file_path, edit_func, config, *args, **kwargs):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    undo_path = file_path.with_suffix(file_path.suffix + ".undo")
    shutil.copy(file_path, undo_path)
    edit_func(file_path, config, *args, **kwargs)
    return f"Edit applied to {file_path}, undo available at {undo_path}"

def undo_edit(file_path, config):
    undo_path = file_path.with_suffix(file_path.suffix + ".undo")
    if undo_path.exists():
        shutil.move(undo_path, file_path)
        return f"Restored {file_path} from undo"
    return "No undo available"