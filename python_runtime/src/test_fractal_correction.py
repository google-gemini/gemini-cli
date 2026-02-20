
# python_runtime/src/test_fractal_correction.py
# The Deeply Nested Test: Verifying Recursive Self-Correction.

import unittest
from governance.fractal_corrector import FractalCorrector

class TestFractalCorrection(unittest.TestCase):

    def test_recursive_integrity(self):
        """
        Verifies that a deeply nested structure with drift is corrected.
        """
        data = {
            "level1": {
                "level2": {
                    "level3": "I think maybe we could potentially try to guess the answer.", # Weak
                    "level3_strong": "The system must enforce absolute structural integrity via the immutable ledger." # Strong
                }
            },
            "root_weak": "Perhaps maybe" # Short weak string
        }

        corrected = FractalCorrector.correct(data)

        # 1. Verify Weakness Redaction
        # The key is correct (level3), but it's a value we want to check
        val = corrected['level1']['level2']['level3']
        self.assertIn("[CORRECTED: RESONANCE_FAILURE", val)

        # 2. Verify Strong Preservation
        self.assertEqual(corrected['level1']['level2']['level3_strong'], data['level1']['level2']['level3_strong'])

        # 3. Verify Short Weak String Redaction
        self.assertIn("[CORRECTED: STOCHASTIC_DRIFT_DETECTED]", corrected['root_weak'])

    def test_infinite_recursion_limit(self):
        """
        Verifies that recursion depth is limited.
        """
        # {"a": {"a": {"a": "maybe"}}}
        deep_data = {"a": {"a": {"a": "maybe"}}}

        # correct(dict, 99) -> returns {"a": correct(subdict, 100)}
        # correct(subdict, 100) -> returns {"a": correct(subsubdict, 101)}
        # correct(subsubdict, 101) -> returns "[RECURSION_DEPTH_EXCEEDED]"

        result = FractalCorrector.correct(deep_data, depth=99, max_depth=100)

        # So result['a'] is dict. result['a']['a'] is string "[RECURSION_DEPTH_EXCEEDED]"

        self.assertEqual(result['a']['a'], "[RECURSION_DEPTH_EXCEEDED]")

if __name__ == '__main__':
    print("=== FRACTAL CORRECTION VERIFICATION ===")
    unittest.main()
