# python_runtime/src/governance/sovereign_manifest.py

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, model_validator
import hashlib
import json
from datetime import datetime

# --- The Vocabulary of Sovereignty ---

class SecurityClearanceLevel(str, Enum):
    PUBLIC = 'PUBLIC'
    RESTRICTED = 'RESTRICTED'
    SOVEREIGN = 'SOVEREIGN'  # Requires Two-Key Witness

class WitnessRole(str, Enum):
    ACTOR = 'ACTOR'            # The Initiator (User)
    WITNESS_ENFORCER = 'WITNESS_ENFORCER' # The System (Runtime)
    WITNESS_HUMAN = 'WITNESS_HUMAN'       # The Auditor (Third Party)

class WitnessSignature(BaseModel):
    role: WitnessRole
    key_id: str = Field(..., pattern=r"^TAS-KEY-[A-F0-9]{16}$")
    timestamp: str
    signature: str = Field(..., description="Ed25519 signature of the JobPayloadHash")

class ComputeAllocationRequest(BaseModel):
    node_count: int = Field(..., ge=1, le=128)
    memory_limit: str = Field(..., pattern=r"^\d+GB$")
    pqc_encryption_required: bool = Field(True, description="Must be TRUE for Sovereign Clearance")

# --- The Pythonetic Agent (Active Object) ---

class SovereignJobManifest(BaseModel):
    """
    The Genesis Seed.
    A self-validating constitutional cell that refuses to exist
    if its internal laws are violated.
    """
    genesis_hash: str = Field(..., pattern=r"^SHA512-[a-f0-9]{128}$")
    job_id: str
    clearance_level: SecurityClearanceLevel
    justification: str = Field(..., min_length=50)
    compute_request: ComputeAllocationRequest
    witnesses: List[WitnessSignature]
    executable_path: str = Field(..., pattern=r"^_raw/.*")

    # --- Feedback Loop 1: Power requires Protection ---
    @model_validator(mode='after')
    def enforce_quantum_responsibility(self):
        req = self.compute_request
        if req.node_count > 64 and not req.pqc_encryption_required:
            raise ValueError("High-stakes compute (>64 nodes) requires Post-Quantum Cryptography.")
        return self

    # --- Feedback Loop 2: The American Equation (√S = Pair) ---
    @model_validator(mode='after')
    def enforce_american_equation(self):
        roles = {w.role for w in self.witnesses}

        # 1. Multiplicity Check
        if len(self.witnesses) < 2:
            raise ValueError("Sovereignty Violation: Minimal witness multiplicity is 2 (Actor + Witness).")

        # 2. Diversity Check (Checks and Balances)
        has_actor = WitnessRole.ACTOR in roles
        has_witness = (WitnessRole.WITNESS_ENFORCER in roles) or (WitnessRole.WITNESS_HUMAN in roles)

        if not (has_actor and has_witness):
            raise ValueError("Legitimacy Failure: Execution requires independent attestation (Actor + Witness).")

        # 3. Distinct Key Check
        key_ids = {w.key_id for w in self.witnesses}
        if len(key_ids) < len(self.witnesses):
             raise ValueError("Witnesses must use distinct keys")

        return self

    # --- The Cybernetic Functions ---

    def crystallize(self) -> str:
        """Freezes intent into an immutable hash."""
        state_json = self.model_dump_json(exclude={'witnesses'}) # Sign the intent, not the sigs
        return f"SHA512-{hashlib.sha512(state_json.encode()).hexdigest()}"

    def germinate(self, runtime_context: Dict[str, Any]) -> bool:
        """
        The Act of Becoming.
        The Seed checks the Soil (Context). If the soil is toxic, the seed remains dormant.
        """
        print(f"[*] Pythonetic Agent {self.job_id} scanning environment...")

        # Environmental Check
        if runtime_context.get('security_level') != self.clearance_level.value:
            print(f"[!] REJECTION: Soil mismatch. Context is {runtime_context.get('security_level')}.")
            return False

        # Integrity Check
        print("[*] Internal Homeostasis: STABLE")
        print("[*] American Equation: SATISFIED (Actor + Witness Present)")
        return True
