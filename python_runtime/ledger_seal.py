import yaml
import os
import sys
import re
from datetime import datetime

# Patch path to allow imports from src
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.governance.sovereign_manifest import SovereignJobManifest

def sanitize_job_id(job_id: str) -> str:
    """
    Sanitize job_id to prevent path traversal and ensure safe filenames.
    Only allow alphanumeric, dashes, and underscores.
    """
    # Replace unsafe characters with underscore
    safe_id = re.sub(r'[^a-zA-Z0-9-_]', '_', job_id)
    # Collapse multiple underscores
    safe_id = re.sub(r'_+', '_', safe_id)
    # Strip leading/trailing underscores/dots (though dots are already replaced)
    return safe_id.strip('_')

def seal_ledger(manifest: SovereignJobManifest) -> str:
    """
    Anchors the final manifest + signatures into the Immutable Ledger.
    File format: ledger/YYYYMMDDTHHMMSS_JOB-ID.yaml
    """
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")

    # 1. Sanitize Job ID (Security Patch)
    safe_job_id = sanitize_job_id(manifest.job_id)
    if not safe_job_id:
        safe_job_id = "UNKNOWN_JOB" # Fallback if empty after sanitization

    filename = f"{timestamp}_{safe_job_id}.yaml"
    filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger", filename)

    # Convert Pydantic model to dict
    data = manifest.model_dump()

    # Add sealing metadata
    sealed_record = {
        "meta": {
            "sealed_at": datetime.now().isoformat(),
            "seal_type": "GENESIS_ANCHOR",
            "runtime_version": "TAS_V1_PYTHON"
        },
        "manifest": data
    }

    # Ensure ledger directory exists
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    with open(filepath, "w") as f:
        yaml.dump(sealed_record, f, default_flow_style=False, sort_keys=True)

    print(f"[LEDGER] Sealed manifest to: {filepath}")
    return filepath
