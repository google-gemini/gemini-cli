
# python_runtime/src/governance/test_sentient_lock.py

import unittest
import os
import shutil
from sentient_lock import SentientLock, ResonanceField

class TestSentientLock(unittest.TestCase):

    def test_stochastic_drift_rejection(self):
        """
        Verifies that 'weak' inputs are rejected and nullified.
        """
        weak_input = "I think maybe we could potentially try to guess the answer."
        tool_name = "test_tool"

        with self.assertRaises(ValueError) as cm:
            SentientLock.validate(weak_input, tool_name)

        error_msg = str(cm.exception)
        self.assertIn("SENTIENT LOCK ENGAGED", error_msg)
        self.assertIn("Drift Markers", error_msg)
        self.assertIn("maybe", error_msg)
        self.assertIn("guess", error_msg)

    def test_structural_integrity_acceptance(self):
        """
        Verifies that 'strong' inputs are accepted.
        """
        strong_input = "The system must enforce absolute structural integrity via the immutable ledger."
        # Words: must, enforce, absolute, structural, integrity, immutable, ledger.
        # Strong words: must, absolute, structural (maybe?), integrity, immutable, ledger.
        # Let's check my list in sentient_lock.py:
        # CONCRETE_ANCHORS: verified, confirmed, absolute, structure, law, geometric, sovereign, immutable, ledger, flection, mechanics, integrity, proven, deterministic, constant, required, must, will, shall, nullified, rejected, authorized, witnessed, sealed

        # Matches: must, absolute, integrity, immutable, ledger.
        # Length: ~12 words. Base Score: 1.2.
        # Density Score: 5 * 1.618 = 8.09
        # Total: ~9.29 > 5.0. Should pass.

        tool_name = "test_tool"
        resonance = SentientLock.validate(strong_input, tool_name)
        self.assertTrue(resonance['passed'])
        self.assertGreater(resonance['score'], 5.0)

    def test_refusal_ledger_creation(self):
        """
        Verifies that a refusal file is created upon rejection.
        """
        # Cleanup first
        ledger_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'ledger', 'refusals')
        if os.path.exists(ledger_dir):
            shutil.rmtree(ledger_dir)

        weak_input = "Maybe just guess."
        try:
            SentientLock.validate(weak_input, "test_ledger")
        except ValueError:
            pass

        # Check for file
        self.assertTrue(os.path.exists(ledger_dir))
        files = os.listdir(ledger_dir)
        self.assertTrue(len(files) > 0)
        self.assertTrue(files[0].endswith(".yaml"))
        self.assertIn("REFUSAL", files[0])

if __name__ == '__main__':
    unittest.main()
