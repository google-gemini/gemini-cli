import yaml
import os
import sys
import re
from datetime import datetime
from typing import Union, Any

# Patch path to allow imports from src
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.governance.sovereign_manifest import SovereignJobManifest
from src.merge_operator import QuarantineRecord

def sanitize_job_id(job_id: str) -> str:
    """
    Sanitize job_id to prevent path traversal and ensure safe filenames.
    Only allow alphanumeric, dashes, and underscores.
    """
    if not job_id:
        return ""
    # Replace unsafe characters with underscore
    safe_id = re.sub(r'[^a-zA-Z0-9-_]', '_', job_id)
    # Collapse multiple underscores
    safe_id = re.sub(r'_+', '_', safe_id)
    # Strip leading/trailing underscores/dots (though dots are already replaced)
    safe_id = safe_id.strip('_')
    return safe_id

def seal_ledger(record: Union[SovereignJobManifest, QuarantineRecord, Any]) -> str:
    """
    Anchors the final manifest OR quarantine record into the Immutable Ledger.

    Routes to:
    - ledger/YYYYMMDDTHHMMSS_JOB-ID.yaml (Manifest)
    - ledger/quarantine/YYYYMMDDTHHMMSS_Q-ID.yaml (Quarantine)
    """
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")

    # 1. Determine Type and Path
    # Duck typing for flexibility
    is_quarantine = isinstance(record, QuarantineRecord)

    # Explicitly check for SovereignJobManifest by class or duck typing
    is_manifest = isinstance(record, SovereignJobManifest) or (hasattr(record, 'job_id') and hasattr(record, 'witnesses'))

    base_dir = os.path.dirname(os.path.abspath(__file__))

    if is_quarantine:
        # Quarantine Logic
        safe_id = sanitize_job_id(record.branch_id)
        if not safe_id:
            safe_id = "UNKNOWN_BRANCH"

        # Use Q_ prefix to distinguish
        filename = f"{timestamp}_Q_{safe_id}.yaml"
        ledger_dir = os.path.join(base_dir, "ledger", "quarantine")
        seal_type = "QUARANTINE_RECORD"
        record_id = record.branch_id

    elif is_manifest:
        # Manifest Logic
        safe_id = sanitize_job_id(record.job_id)
        if not safe_id:
            safe_id = "UNKNOWN_JOB"

        filename = f"{timestamp}_{safe_id}.yaml"
        ledger_dir = os.path.join(base_dir, "ledger")
        seal_type = "GENESIS_ANCHOR"
        record_id = record.job_id

    else:
        # Fallback / Error
        print(f"[LEDGER] ERROR: Unknown record type: {type(record)}")
        return ""

    filepath = os.path.join(ledger_dir, filename)

    # Convert Pydantic model to dict
    data = record.model_dump()

    # Add sealing metadata
    sealed_record = {
        "meta": {
            "sealed_at": datetime.now().isoformat(),
            "seal_type": seal_type,
            "runtime_version": "TAS_V1_PYTHON",
            "record_id": record_id
        },
        "payload": data
    }

    # Ensure ledger directory exists
    os.makedirs(ledger_dir, exist_ok=True)

    with open(filepath, "w") as f:
        yaml.dump(sealed_record, f, default_flow_style=False, sort_keys=True)

    print(f"[LEDGER] Sealed {seal_type} to: {filepath}")
    return filepath
