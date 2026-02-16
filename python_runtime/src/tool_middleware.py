# python_runtime/src/tool_middleware.py
# The Kernel: Enforces justification and auditing via Governance Schema.

import functools
import datetime
import json
import os

# Load Governance Schema
GOVERNANCE_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'governance.json')
SCHEMA_CONSTRAINTS = {}

if os.path.exists(GOVERNANCE_FILE):
    try:
        with open(GOVERNANCE_FILE, 'r') as f:
            schema = json.load(f)
            # Extract justification constraints from JSON Schema
            # Structure: definitions -> SovereignToolInvocation -> properties -> justification
            props = schema.get('definitions', {}).get('SovereignToolInvocation', {}).get('properties', {})
            justification_rules = props.get('justification', {})
            SCHEMA_CONSTRAINTS['min_len'] = justification_rules.get('minLength', 10)
            SCHEMA_CONSTRAINTS['max_len'] = justification_rules.get('maxLength', 1000)
            print(f"[KERNEL] Loaded Governance Constraints: Justification {SCHEMA_CONSTRAINTS['min_len']}-{SCHEMA_CONSTRAINTS['max_len']} chars")
    except Exception as e:
        print(f"[KERNEL] Warning: Failed to load governance schema: {e}")

def with_sovereign_gate(tool_name: str, func):
    """
    Wraps a raw tool with the Sovereign Gate.
    Enforces justification length based on loaded schema.
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        justification = kwargs.pop('justification', None)
        if justification is None and args:
            if len(args) > func.__code__.co_argcount:
                 justification = args[-1]
                 args = args[:-1]

        min_len = SCHEMA_CONSTRAINTS.get('min_len', 10)
        max_len = SCHEMA_CONSTRAINTS.get('max_len', 1000)

        if not justification or not isinstance(justification, str):
             raise ValueError(f"SOVEREIGNTY VIOLATION: Tool '{tool_name}' requires a justification string.")

        if len(justification) < min_len:
            raise ValueError(f"SOVEREIGNTY VIOLATION: Justification too short (Min: {min_len}).")

        if len(justification) > max_len:
            raise ValueError(f"SOVEREIGNTY VIOLATION: Justification too long (Max: {max_len}).")

        timestamp = datetime.datetime.now().isoformat()
        print(f"[AUDIT] {timestamp} | TOOL: {tool_name} | JUSTIFICATION: {justification}")

        return func(*args, **kwargs)

    wrapper._is_sovereign_wrapped = True
    return wrapper
