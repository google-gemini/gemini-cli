# python_runtime/src/tool_middleware.py
# The Kernel: Enforces justification and auditing.

import functools
import datetime

def with_sovereign_gate(tool_name: str, func):
    """
    Wraps a raw tool with the Sovereign Gate.
    Requires a 'justification' argument to be passed by the caller.
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Extract justification (expected as last arg or kwarg)
        justification = kwargs.pop('justification', None)
        if justification is None and args:
            # Assume last arg is justification if not provided as kwarg
            # Ideally, we'd enforce signature, but for this prototype we peel the last arg
            if len(args) > func.__code__.co_argcount:
                 justification = args[-1]
                 args = args[:-1]

        if not justification or not isinstance(justification, str) or len(justification) < 10:
            raise ValueError(f"SOVEREIGNTY VIOLATION: Tool '{tool_name}' requires a valid justification string (>10 chars).")

        # Audit Log
        timestamp = datetime.datetime.now().isoformat()
        print(f"[AUDIT] {timestamp} | TOOL: {tool_name} | JUSTIFICATION: {justification}")

        # Execute Raw Tool
        return func(*args, **kwargs)

    # Mark as wrapped for the Enforcer
    wrapper._is_sovereign_wrapped = True
    return wrapper
