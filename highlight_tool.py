from pathlib import Path
from pygments import highlight
from pygments.lexers import guess_lexer_for_filename
from pygments.formatters import TerminalFormatter
from check_file_permission import check_file_permission

def highlight_file(file_path, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    lexer = guess_lexer_for_filename(file_path.name, content)
    return highlight(content, lexer, TerminalFormatter())