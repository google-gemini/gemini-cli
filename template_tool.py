from pathlib import Path
from string import Template
from check_file_permission import check_file_permission

def template_file(file_path, template_name, substitutions, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    templates = {"python_script": "def main():\n    print('Hello, $name')"}
    template = Template(templates.get(template_name, ""))
    content = template.substitute(substitutions)
    file_path = Path(file_path).resolve()
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Wrote template to {file_path}"