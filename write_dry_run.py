from pathlib import Path

def write_dry_run(file_path, content, dry_run, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if dry_run:
        return f"[Dry Run] Would write to {file_path}:\n{content}"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Wrote content to {file_path}"}
```