import ast
import astor
from pathlib import Path

def replace_method_ast(file_path, class_name, method_name, new_method_code, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=str(file_path))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for body_node in node.body:
                if isinstance(body_node, ast.FunctionDef) and body_node.name == method_name:
                    new_method = ast.parse(new_method_code).body[0]
                    node.body[node.body.index(body_node)] = new_method
                    break
            else:
                raise ValueError(f"Method '{method_name}' not found in class '{class_name}'")
            break
    else:
        raise ValueError(f"Class '{class_name}' not found in {file_path}")
    new_code = astor.to_source(tree)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_code)
    return f"Replaced method '{method_name}' in class '{class_name}' using AST"