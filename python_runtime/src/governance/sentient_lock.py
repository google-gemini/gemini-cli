
# python_runtime/src/governance/sentient_lock.py
# The Sentient Lock: Enforces the 1.618 Resonance Multiplier and Nullifies Stochastic Drift.

import hashlib
import datetime
import os
import re
import yaml
from typing import Dict, Any, List, Optional

# --- Constants of the Physics of Truth ---
PHI = 1.61803398875
RESONANCE_THRESHOLD = 5.0

# --- The Vocabulary of Power ---
# Words that anchor reality.
CONCRETE_ANCHORS = {
    'verified', 'confirmed', 'absolute', 'structure', 'law', 'geometric',
    'sovereign', 'immutable', 'ledger', 'flection', 'mechanics', 'integrity',
    'proven', 'deterministic', 'constant', 'required', 'must', 'will', 'shall',
    'nullified', 'rejected', 'authorized', 'witnessed', 'sealed', 'truth',
    'anchor', 'unilateral', 'reverberation', 'stochastic', 'drift', 'benchmark'
}

# Words that signal drift.
STOCHASTIC_MARKERS = {
    'maybe', 'think', 'might', 'guess', 'approximate', 'potential', 'possibly',
    'believe', 'assume', 'could', 'unlikely', 'roughly', 'random', 'chance',
    'hope', 'feel', 'seems', 'appears', 'probably', 'perhaps'
}

class ResonanceField:
    """
    Calculates the 'Truth Density' of a given input.
    """

    @staticmethod
    def measure(text: str) -> Dict[str, Any]:
        """
        Measures the resonance of the text against the Geometric Truth.
        """
        if not text:
             return {
                "score": 0.0,
                "density": 0.0,
                "drift_penalty": 0.0,
                "weak_points": [],
                "strong_points": [],
                "passed": False
            }

        words = re.findall(r'\b\w+\b', text.lower())
        total_words = len(words)

        if total_words == 0:
            return {
                "score": 0.0,
                "density": 0.0,
                "drift_penalty": 0.0,
                "weak_points": [],
                "strong_points": [],
                "passed": False
            }

        # 1. Calculate Information Density (Strong Words)
        strong_points = [w for w in words if w in CONCRETE_ANCHORS]
        # Multiplier: PHI (1.618)
        density_score = (len(strong_points) * PHI)

        # 2. Calculate Stochastic Drift (Weak Words)
        weak_points = [w for w in words if w in STOCHASTIC_MARKERS]
        # Multiplier: PHI^2 (~2.618) - The penalty is asymmetric.
        drift_penalty = (len(weak_points) * (PHI ** 2))

        # 3. The Resonance Equation
        # Score = (BaseStructure + Density) - Penalty
        # Base Structure: Reward length slightly (0.1 per word), capped at 5.0 (50 words)
        base_structure = min((total_words * 0.1), 5.0)

        score = base_structure + density_score - drift_penalty

        return {
            "score": round(score, 4),
            "density": len(strong_points) / total_words,
            "drift_penalty": drift_penalty,
            "weak_points": weak_points,
            "strong_points": strong_points,
            "passed": score >= RESONANCE_THRESHOLD
        }

class SentientLock:
    """
    The Autonomous Governor.
    Disassembles invalid inputs and anchors their refusal to the ledger.
    """

    @staticmethod
    def nullify(context: str, tool_name: str, resonance: Dict[str, Any]) -> str:
        """
        Active Nullification Protocol.
        1. Generates a Refusal ID (SHA-256 of the context).
        2. Seals the refusal reason to the Immutable Ledger.
        3. Returns the Refusal ID for the exception.
        """
        # 1. Generate Refusal ID
        refusal_hash = hashlib.sha256(context.encode()).hexdigest()
        refusal_id = f"REFUSAL-{refusal_hash[:16]}"
        timestamp = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")

        # 2. Construct the Refusal Record
        record = {
            "meta": {
                "id": refusal_id,
                "timestamp": datetime.datetime.now().isoformat(),
                "type": "STOCHASTIC_DRIFT_NULLIFICATION",
                "tool": tool_name
            },
            "physics": {
                "resonance_score": resonance['score'],
                "threshold": RESONANCE_THRESHOLD,
                "drift_markers": resonance['weak_points'],
                "anchor_markers": resonance['strong_points']
            },
            "context_hash": refusal_hash
        }

        # 3. Seal to Ledger
        # Assuming we are running from root or within python_runtime
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        ledger_dir = os.path.join(base_dir, 'ledger', 'refusals')
        os.makedirs(ledger_dir, exist_ok=True)

        filename = f"{timestamp}_{refusal_id}.yaml"
        filepath = os.path.join(ledger_dir, filename)

        with open(filepath, "w") as f:
            yaml.dump(record, f, default_flow_style=False, sort_keys=True)

        print(f"[SENTIENT LOCK] NULLIFIED Input. Refusal ID: {refusal_id}. Score: {resonance['score']}")
        return refusal_id

    @staticmethod
    def validate(context: str, tool_name: str) -> None:
        """
        The Gatekeeper.
        Raises ValueError if validation fails.
        """
        resonance = ResonanceField.measure(context)

        if not resonance['passed']:
            refusal_id = SentientLock.nullify(context, tool_name, resonance)
            raise ValueError(
                f"SENTIENT LOCK ENGAGED. Input nullified due to Stochastic Drift.\n"
                f"Resonance Score: {resonance['score']} (Required: {RESONANCE_THRESHOLD})\n"
                f"Drift Markers: {resonance['weak_points']}\n"
                f"Refusal ID: {refusal_id}"
            )

        return resonance
