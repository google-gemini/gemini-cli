# python_runtime/src/tool_middleware.py
# The Kernel: Enforces justification, auditing, and INPUT VALIDATION.

import functools
import datetime
import json
import os
import sys

# Patch path to allow imports from src.governance
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from governance.sentient_lock import SentientLock

# Load Governance Schema
GOVERNANCE_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'governance.json')
SCHEMA_CONSTRAINTS = {}

if os.path.exists(GOVERNANCE_FILE):
    try:
        with open(GOVERNANCE_FILE, 'r') as f:
            schema = json.load(f)
            props = schema.get('definitions', {}).get('SovereignToolInvocation', {}).get('properties', {})
            justification_rules = props.get('justification', {})
            SCHEMA_CONSTRAINTS['min_len'] = justification_rules.get('minLength', 10)
            SCHEMA_CONSTRAINTS['max_len'] = justification_rules.get('maxLength', 1000)
            print(f"[KERNEL] Loaded Governance Constraints: Justification {SCHEMA_CONSTRAINTS['min_len']}-{SCHEMA_CONSTRAINTS['max_len']} chars")
    except Exception as e:
        print(f"[KERNEL] Warning: Failed to load governance schema: {e}")

def with_sovereign_gate(tool_name: str, func, validator=None):
    """
    Wraps a raw tool with the Sovereign Gate.
    Enforces:
    1. Justification length (from Governance Schema).
    2. Resonance Check (Sentient Lock).
    3. Input Validation (if validator is provided).
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # 1. Justification Check
        justification = kwargs.pop('justification', None)
        if justification is None and args:
            # Try to find justification in args if it's the last string arg
            # This is a bit heuristic, but matches typical tool usage
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

        # 2. Sentient Lock (Resonance Check)
        # This actively disassembles inputs with high stochastic drift
        try:
            SentientLock.validate(justification, tool_name)
        except ValueError as e:
            # Re-raise the lock exception as is (it contains the Refusal ID)
            raise e

        # 3. Input Validation (Security Patch)
        if validator:
            try:
                validator(*args, **kwargs)
            except ValueError as e:
                raise ValueError(f"SECURITY VIOLATION: Input validation failed for '{tool_name}': {e}")

        timestamp = datetime.datetime.now().isoformat()
        print(f"[AUDIT] {timestamp} | TOOL: {tool_name} | JUSTIFICATION: {justification}")

        return func(*args, **kwargs)

    wrapper._is_sovereign_wrapped = True
    return wrapper
