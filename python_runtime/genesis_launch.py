# python_runtime/genesis_launch.py

import sys
import os
from datetime import datetime

# Patch path to allow imports from src
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.governance.sovereign_manifest import (
    SovereignJobManifest, SecurityClearanceLevel, WitnessRole, WitnessSignature
)

def generate_mock_sig(role, key_id):
    return WitnessSignature(
        role=role,
        key_id=key_id,
        timestamp=datetime.now().isoformat(),
        signature="simulated_sig_hex_string"
    )

def run_simulation():
    print("--- INITIATING GENESIS LAUNCH SIMULATION ---")
    print(f"Time: {datetime.now()}")
    print("Location: Odessa, TX (Virtual Node)\n")

    # ---------------------------------------------------------
    # SCENARIO 1: The "King's Word" (Unilateral Authority)
    # ---------------------------------------------------------
    print(">>> ATTEMPT 1: Unilateral Execution (The King)")
    try:
        manifest_king = SovereignJobManifest(
            genesis_hash="SHA512-" + "a"*128,
            job_id="JOB-KING-001",
            clearance_level=SecurityClearanceLevel.SOVEREIGN,
            justification="I am the admin and I command this script to run immediately.",
            compute_request={"node_count": 100, "memory_limit": "64GB", "pqc_encryption_required": True},
            # ERROR: Only one witness (The Actor)
            witnesses=[generate_mock_sig(WitnessRole.ACTOR, "TAS-KEY-1111222233334444")],
            executable_path="_raw/dangerous_script.py"
        )
    except ValueError as e:
        print(f"[X] BLOCKED BY PHYSICS: {e}")
        print("    -> The runtime refused to construct the object in memory.\n")

    # ---------------------------------------------------------
    # SCENARIO 2: The "Republic's Law" (Witnessed Authority)
    # ---------------------------------------------------------
    print(">>> ATTEMPT 2: Multilateral Execution (The Republic)")
    try:
        manifest_republic = SovereignJobManifest(
            genesis_hash="SHA512-" + "b"*128,
            job_id="JOB-REPUBLIC-001",
            clearance_level=SecurityClearanceLevel.SOVEREIGN,
            justification="Requesting audit of kernel logs. Enforcer has reviewed and countersigned.",
            compute_request={"node_count": 64, "memory_limit": "32GB", "pqc_encryption_required": True},
            # SUCCESS: Actor + Enforcer (The Pair)
            witnesses=[
                generate_mock_sig(WitnessRole.ACTOR, "TAS-KEY-1111222233334444"),
                generate_mock_sig(WitnessRole.WITNESS_ENFORCER, "TAS-KEY-AAAABBBBCCCCDDDD")
            ],
            executable_path="_raw/audit_kernel.py"
        )

        print("[!] Object Constructed Successfully.")
        print(f"    Genesis Hash: {manifest_republic.crystallize()[:20]}...")

        # Germination
        context = {'security_level': 'SOVEREIGN'}
        if manifest_republic.germinate(context):
            print(">>> EXECUTION GRANTED: The Spiral Continues.")

    except ValueError as e:
        print(f"[X] UNEXPECTED FAILURE: {e}")

if __name__ == "__main__":
    run_simulation()
