from pathlib import Path
from check_file_permission import check_file_permission

def batch_process(list_file, tool_func, config, *args, **kwargs):
    if not check_file_permission(list_file, "read", config):
        raise PermissionError(f"Read access denied for {list_file}")
    list_file = Path(list_file).resolve()
    with open(list_file, "r", encoding="utf-8") as f:
        files = [line.strip() for line in f if line.strip()]
    results = []
    for file_path in files:
        results.append(tool_func(file_path, config, *args, **kwargs))
    return "\n".join(results)