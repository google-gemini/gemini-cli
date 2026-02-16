import yaml
import os
import sys
from datetime import datetime

# Patch path to allow imports from src
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.governance.sovereign_manifest import SovereignJobManifest

def seal_ledger(manifest: SovereignJobManifest) -> str:
    """
    Anchors the final manifest + signatures into the Immutable Ledger.
    File format: ledger/YYYYMMDDTHHMMSS_JOB-ID.yaml
    """
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    filename = f"{timestamp}_{manifest.job_id}.yaml"
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

    with open(filepath, "w") as f:
        yaml.dump(sealed_record, f, default_flow_style=False, sort_keys=True)

    print(f"[LEDGER] Sealed manifest to: {filepath}")
    return filepath
