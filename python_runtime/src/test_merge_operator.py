
# python_runtime/src/test_merge_operator.py
# The Must-Fail Suite: Verifies the Gearbox of Truth.

import unittest
import hashlib
import json
import datetime
from merge_operator import (
    MergeOperator, MergeOutcome, BranchEvent, BranchChain, LedgerHead, AttestationType, QuarantineRecord
)

# Helper for creating valid SHA256 hashes
def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def create_event(
    prev_hash: str,
    counter: int,
    payload="test",
    signatures=None,
    force_invalid_signatures=False
) -> BranchEvent:
    if signatures is None and not force_invalid_signatures:
        signatures = {
            AttestationType.SHA256.value: "sig_sha256",
            AttestationType.ML_DSA_65.value: "sig_mldsa"
        }
    elif force_invalid_signatures:
         signatures = {AttestationType.SHA256.value: "only_sha"}

    state_hash = sha256(f"{prev_hash}{counter}{payload}")
    payload_hash = sha256(payload)

    return BranchEvent(
        prev_hash=prev_hash,
        state_hash=state_hash,
        payload_hash=payload_hash,
        timestamp_utc=datetime.datetime.now().isoformat(),
        monotonic_counter=counter,
        signatures=signatures
    )

class TestMergeOperator(unittest.TestCase):

    def setUp(self):
        # Ledger Head at height 100
        self.head_hash = sha256("genesis")
        self.ledger_head = LedgerHead(head_hash=self.head_hash, height=100)

    def test_clean_fast_forward(self):
        """
        Test Case 5: Clean Fast-Forward -> Expect FAST_FORWARD_APPEND
        """
        # Event 101 extends head
        evt1 = create_event(self.head_hash, 101)
        # Event 102 extends evt1
        evt2 = create_event(evt1.state_hash, 102)

        branch = BranchChain(events=[evt1, evt2], branch_id="clean_branch")

        outcome, artifact = MergeOperator.merge(branch, self.ledger_head)
        self.assertEqual(outcome, MergeOutcome.FAST_FORWARD_APPEND)
        self.assertIsNone(artifact)

    def test_false_zero_attempt(self):
        """
        Test Case 1: False Zero Attempt (Same height, different head hash) -> Expect QUARANTINE
        """
        fake_head = sha256("fake")
        # Event claiming height 100 (overlap) but different hash
        evt_zero = create_event(fake_head, 100)

        branch = BranchChain(events=[evt_zero], branch_id="false_zero_branch")

        outcome, artifact = MergeOperator.merge(branch, self.ledger_head)
        self.assertEqual(outcome, MergeOutcome.QUARANTINE)
        self.assertIsInstance(artifact, QuarantineRecord)
        self.assertEqual(artifact.reason_code, "FALSE_ZERO_FORK_DETECTED")

    def test_downgrade_attempt(self):
        """
        Test Case 2: Downgrade Attempt (Missing ML-DSA signature) -> Expect QUARANTINE
        """
        evt1 = create_event(self.head_hash, 101, force_invalid_signatures=True)

        branch = BranchChain(events=[evt1], branch_id="downgrade_branch")

        outcome, artifact = MergeOperator.merge(branch, self.ledger_head)
        self.assertEqual(outcome, MergeOutcome.QUARANTINE)
        self.assertIsInstance(artifact, QuarantineRecord)
        self.assertEqual(artifact.reason_code, "MISSING_PQ_SIGNATURE")

    def test_fork_injection(self):
        """
        Test Case 3: Fork Injection (Bad prev_hash chain) -> Expect QUARANTINE
        """
        evt1 = create_event(self.head_hash, 101)
        # Event 2 points to a random hash, not evt1
        bad_prev = sha256("bad_prev")
        evt2 = create_event(bad_prev, 102)

        branch = BranchChain(events=[evt1, evt2], branch_id="fork_injection_branch")

        outcome, artifact = MergeOperator.merge(branch, self.ledger_head)
        self.assertEqual(outcome, MergeOutcome.QUARANTINE)
        self.assertIsInstance(artifact, QuarantineRecord)
        self.assertEqual(artifact.reason_code, "BROKEN_CHAIN_LINK")

    def test_rebase_violation_monotonicity(self):
        """
        Test Case 4: Rebase Violation (Rebase breaks monotonicity) -> Expect QUARANTINE
        """
        evt1 = create_event(self.head_hash, 101)
        # Event 2 points to evt1 but has same counter (101)
        # create_event uses counter in hash, so state_hash is unique even if payload same.
        evt2 = create_event(evt1.state_hash, 101, payload="dupe_counter")

        branch = BranchChain(events=[evt1, evt2], branch_id="monotonicity_fail_branch")

        outcome, artifact = MergeOperator.merge(branch, self.ledger_head)
        self.assertEqual(outcome, MergeOutcome.QUARANTINE)
        self.assertIsInstance(artifact, QuarantineRecord)
        self.assertEqual(artifact.reason_code, "MONOTONICITY_FAILURE")

if __name__ == '__main__':
    print("=== MERGE PROTOCOL VERIFICATION ===")
    unittest.main()
