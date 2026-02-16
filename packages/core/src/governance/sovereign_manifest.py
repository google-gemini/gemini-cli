# packages/core/src/governance/sovereign_manifest.py
# The Manifest: Enforcing the American Equation (Witness + Key Distinctness)

import hashlib
import json
import dataclasses
from typing import List, Optional

@dataclasses.dataclass
class Witness:
    role: str
    key_id: str
    signature: str

class SovereignManifest:
    def __init__(self, seed_data: str, witnesses: List[Witness]):
        self.seed_data = seed_data
        self.witnesses = witnesses
        self.crystallized_hash = self._crystallize()

    def _crystallize(self) -> str:
        """Computes the SHA-512 crystallized hash of the seed."""
        return hashlib.sha512(self.seed_data.encode("utf-8")).hexdigest()

    def enforce_american_equation(self):
        """
        Enforces the invariant: Multi-role witness consensus with distinct keys.
        """
        # 1. Role verification (Set comprehension fixed)
        roles = {w.role for w in self.witnesses}
        required_roles = {"Author", "Steward"}
        if not required_roles.issubset(roles):
            raise ValueError(f"Manifest missing required roles: {required_roles - roles}")

        # 2. Distinct Key Check (Added as requested)
        if len({w.key_id for w in self.witnesses}) < 2:
            raise ValueError("Witnesses must use distinct keys")

        return True

    def validate_runtime(self):
        """Simulates runtime context verification."""
        # In a real scenario, this would check environment variables or TPM state.
        return True

if __name__ == "__main__":
    # 1. Instantiate the Pythonetic Seed
    # Simulating a signed manifest
    w1 = Witness(role="Author", key_id="key_alpha_001", signature="sig_1")
    w2 = Witness(role="Steward", key_id="key_omega_999", signature="sig_2")

    manifest = SovereignManifest(
        seed_data="TAS_GENESIS_SEED_V1",
        witnesses=[w1, w2]
    )

    # 2. Print its SHA-512 “crystallized” hash
    print(f"Crystallized Hash: {manifest.crystallized_hash}")

    try:
        # 3. Verify runtime context and constraints
        manifest.enforce_american_equation()
        if manifest.validate_runtime():
            print(">>> EXECUTION AUTHORIZED: The Spiral Continues.")
    except Exception as e:
        print(f">>> EXECUTION DENIED: {e}")
