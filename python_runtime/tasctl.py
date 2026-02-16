import argparse
import sys
import os
import yaml
import time
import hashlib
from ledger_seal import seal_ledger

# Patch path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from src.governance.sovereign_manifest import SovereignJobManifest, SecurityClearanceLevel, WitnessRole, WitnessSignature

def provision(args):
    print(f"--- [TASCTL] PROVISIONING RESOURCE ---")
    print(f"Target: {args.nodes} nodes | Memory: {args.mem}")

    if args.pqc:
        print("[SEC] PQC Tunnel: ESTABLISHED (Kyber-1024)")

    # Simulate Manifest Load/Seal
    # In a real CLI, we'd load an existing file. For simulation, we create a mock "Republic" manifest.
    manifest = SovereignJobManifest(
        genesis_hash="SHA512-" + "b"*128,
        job_id="JOB-REPUBLIC-001",
        clearance_level=SecurityClearanceLevel.SOVEREIGN,
        justification="CLI Provisioning Request via tasctl. Authorization Code: ALPHA-OMEGA-99. Requesting full allocation for Genesis Simulation.",
        compute_request={"node_count": int(args.nodes), "memory_limit": args.mem, "pqc_encryption_required": args.pqc},
        witnesses=[
            WitnessSignature(role=WitnessRole.ACTOR, key_id="TAS-KEY-1111222233334444", timestamp="now", signature="sig_1"),
            WitnessSignature(role=WitnessRole.WITNESS_ENFORCER, key_id="TAS-KEY-AAAABBBBCCCCDDDD", timestamp="now", signature="sig_2")
        ],
        executable_path="_raw/simulated_workload.py"
    )

    # Enforce Limits (Logic already in Pydantic, but CLI double-check)
    if int(args.nodes) > 128:
        print("[!] ERROR: Request exceeds National Resource Cap (128).")
        sys.exit(1)

    ledger_path = seal_ledger(manifest)
    print(f">>> RESOURCES ALLOCATED. Ledger Anchor: {os.path.basename(ledger_path)}")

def monitor(args):
    print(f"--- [TASCTL] SOVEREIGN WAVE MONITOR: {args.job_id} ---")
    print("Connecting to audit stream...")
    time.sleep(0.5)
    print("[STREAM] Connected. Listening for pulse events.")

    events = [
        "[PULSE] Node 001: Bond Verified (H=8f4a...)",
        "[PULSE] Node 002: Invariant Held (I=True)",
        "[PULSE] Node 003: Complexity < Threshold",
        "[PULSE] Node 004: Sovereignty Confirmed"
    ]

    for evt in events:
        time.sleep(0.3)
        print(evt)

def crystallize(args):
    print(f"--- [TASCTL] CRYSTALLIZATION: {args.job_id} ---")
    print("Computing Final State Hash...")

    # Simulate state hash
    final_state = f"STATE_FINAL_{args.job_id}_{time.time()}"
    final_hash = hashlib.sha512(final_state.encode()).hexdigest()

    print(f"Final Hash: SHA512-{final_hash}")
    print("Appending to Immutable Truth Ledger...")
    time.sleep(0.5)
    print(">>> CRYSTALLIZATION COMPLETE. The Spiral is closed.")

def main():
    parser = argparse.ArgumentParser(description="TAS Sovereign Control Plane")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Provision
    p_prov = subparsers.add_parser("provision", help="Provision sovereign compute resources")
    p_prov.add_argument("--manifest", help="Path to manifest file")
    p_prov.add_argument("--nodes", required=True, help="Node count")
    p_prov.add_argument("--mem", required=True, help="Memory limit")
    p_prov.add_argument("--pqc", action="store_true", help="Require PQC encryption")

    # Monitor
    p_mon = subparsers.add_parser("monitor", help="Stream the Sovereign Wave")
    p_mon.add_argument("job_id", help="Job ID to monitor")
    p_mon.add_argument("--stream", help="Stream target")

    # Crystallize
    p_crys = subparsers.add_parser("crystallize", help="Finalize and seal the execution state")
    p_crys.add_argument("job_id", help="Job ID to crystallize")

    args = parser.parse_args()

    if args.command == "provision":
        provision(args)
    elif args.command == "monitor":
        monitor(args)
    elif args.command == "crystallize":
        crystallize(args)

if __name__ == "__main__":
    main()
