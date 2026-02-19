
import unittest
import os
import shutil
import datetime
import sys

# Add python_runtime to path
sys.path.append(os.getcwd())

from python_runtime.ledger_seal import seal_ledger, sanitize_job_id

class MockManifest:
    def __init__(self, job_id):
        self.job_id = job_id

    def model_dump(self):
        return {"job_id": self.job_id, "mock": True}

class TestLedgerSeal(unittest.TestCase):
    def test_sanitize_job_id(self):
        # Basic
        self.assertEqual(sanitize_job_id("my_job"), "my_job")
        # Traversal - expected stripped leading underscore
        self.assertEqual(sanitize_job_id("../../../evil_job"), "evil_job")
        # Special chars
        self.assertEqual(sanitize_job_id("job@#$%^&*()!"), "job")
        # Empty
        self.assertEqual(sanitize_job_id(""), "")
        # With spaces
        self.assertEqual(sanitize_job_id("my job"), "my_job")

    def test_seal_ledger_path_traversal(self):
        # Create a mock manifest
        manifest = MockManifest("../../../../../tmp/pwned")

        # This should seal to a file in ledger/ with a safe name
        filepath = seal_ledger(manifest)

        print(f"Sealed to: {filepath}")

        # Verify it didn't write to /tmp/pwned
        filename = os.path.basename(filepath)

        # Depending on sanitization, underscores are collapsed
        # ../../../../../tmp/pwned -> ______tmp_pwned -> _tmp_pwned -> tmp_pwned (stripped)

        self.assertTrue("tmp_pwned.yaml" in filename)
        self.assertTrue(filepath.endswith(".yaml"))

        # Verify the file is in the ledger directory
        ledger_dir = os.path.join(os.getcwd(), "python_runtime", "ledger")
        self.assertTrue(filepath.startswith(ledger_dir))

        # Cleanup created file
        if os.path.exists(filepath):
            os.remove(filepath)

if __name__ == '__main__':
    unittest.main()
