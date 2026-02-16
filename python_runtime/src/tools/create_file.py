# python_runtime/src/tools/create_file.py
# The Conscience: Binds the Hand to the Kernel.

from ..tool_middleware import with_sovereign_gate
from ._raw.create_file import create_file_raw

# THE BINDING
# 1. "create_file" -> Tool Name
# 2. create_file_raw -> The Hand
# 3. with_sovereign_gate -> The Kernel
create_file = with_sovereign_gate("create_file", create_file_raw)

# Uncommenting this would fail the Enforcer check (Rule 2):
# unsafe_create = create_file_raw
