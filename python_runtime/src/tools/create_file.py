# python_runtime/src/tools/create_file.py
# The Conscience: Binds the Hand to the Kernel.

from ..tool_middleware import with_sovereign_gate
from ._raw.create_file import create_file_raw
import os

def validate_create_file(path: str, content: str):
    """
    Validates input to prevent path traversal and arbitrary writes.
    """
    # 1. Traversal Check
    if ".." in path:
        raise ValueError("Path traversal detected. '..' is not allowed.")

    # 2. Absolute Path Check (Sandbox Enforcement)
    # Ideally, we enforce a sandbox root, but for this prototype, we block absolute paths
    # to prevent writing to /etc, /var, etc.
    if os.path.isabs(path):
        raise ValueError("Absolute paths are forbidden. Use relative paths within the workspace.")

    # 3. Sensitive File Blocklist
    blocked_files = {'.bashrc', '.profile', '.ssh/id_rsa', '/etc/passwd'}
    if any(path.endswith(b) for b in blocked_files):
        raise ValueError("Access to sensitive system files is blocked.")

    return True

# THE BINDING
# 1. "create_file" -> Tool Name
# 2. create_file_raw -> The Hand
# 3. with_sovereign_gate -> The Kernel (with Validator)
create_file = with_sovereign_gate("create_file", create_file_raw, validator=validate_create_file)
