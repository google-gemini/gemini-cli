from pathlib import Path
from string import Template

def write_from_template(file_path, template_name, substitutions, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    templates = {"basic": "Hello, $name!\nThis is a $type file."}
    template = Template(templates.get(template_name, ""))
    content = template.substitute(substitutions)
    file_path = Path(file_path).resolve()
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Wrote template to {file_path}"
