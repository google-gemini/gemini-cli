import unittest
import copy
from utils.validator import validate_triage_result

VALID_TRIAGE_PAYLOAD = {
    "triage_metadata": {
        "quality": "OK",
        "effort_estimate": "SMALL",
        "reasoning": "Clear bug report with reproduction steps."
    },
    "workable_spec": {
        "issue_id": "google-gemini/gemini-cli#245",
        "summary": {
            "problem": "Uncaught TypeError when running gemini triage with empty config.",
            "root_cause": "Config loader assumes .gemini/settings.json always exists.",
            "context": "Occurs during fresh installs before settings are initialized."
        },
        "implementation_plan": {
            "files_to_modify": ["src/config.ts", "src/cli.ts"],
            "steps": [
                "Add filesystem check for settings.json in config loader.",
                "Return default configuration if file is missing."
            ]
        },
        "testing_strategy": {
            "test_file": "tests/config.test.ts",
            "expected_behavior": "CLI boots with default settings when settings.json is missing.",
            "verification_steps": [
                "Add unit test mocking missing settings.json.",
                "Assert default config object is returned."
            ],
            "framework": "Vitest"
        }
    }
}

class TestValidator(unittest.TestCase):

    def setUp(self):
        self.payload = copy.deepcopy(VALID_TRIAGE_PAYLOAD)

    def test_valid_triage(self):
        """valid triage result matching complete schema should pass"""
        validate_triage_result(self.payload)

    def test_needs_info_comment_fallback(self):
        """
        NEEDS_INFO quality with missing/empty comment injects a non-empty
        default fallback comment string instead of raising a validation failure.
        """
        for empty_val in [None, "", "   "]:
            with self.subTest(empty_val=empty_val):
                payload = {
                    "triage_metadata": {
                        "quality": "NEEDS_INFO",
                        "reasoning": "Issue missing logs."
                    }
                }
                if empty_val is not None:
                    payload["triage_metadata"]["comment"] = empty_val
                validate_triage_result(payload)
                comment = payload["triage_metadata"].get("comment")
                self.assertIsInstance(comment, str)
                self.assertTrue(len(comment.strip()) > 0)

    def test_missing_triage_metadata(self):
        """payload missing triage_metadata should fail"""
        del self.payload["triage_metadata"]
        with self.assertRaises(ValueError):
            validate_triage_result(self.payload)

    def test_invalid_quality(self):
        """triage_metadata with unexpected quality status should fail"""
        self.payload["triage_metadata"]["quality"] = "DANGER"
        with self.assertRaises(ValueError) as ctx:
            validate_triage_result(self.payload)
        self.assertIn("Invalid or missing 'quality'", str(ctx.exception))

    def test_invalid_effort(self):
        """triage_metadata with unexpected effort estimate should fail"""
        self.payload["triage_metadata"]["effort_estimate"] = "HUGE"
        with self.assertRaises(ValueError) as ctx:
            validate_triage_result(self.payload)
        self.assertIn("Invalid or missing 'effort_estimate'", str(ctx.exception))

    def test_invalid_issue_id_format(self):
        """workable_spec with malformed issue_id format should fail"""
        self.payload["workable_spec"]["issue_id"] = "123_invalid"
        with self.assertRaises(ValueError) as ctx:
            validate_triage_result(self.payload)
        self.assertIn("issue_id", str(ctx.exception))

    def test_summary_not_object(self):
        """workable_spec with summary as string instead of object should fail"""
        self.payload["workable_spec"]["summary"] = "Raw string summary"
        with self.assertRaises(ValueError) as ctx:
            validate_triage_result(self.payload)
        self.assertIn("summary", str(ctx.exception))

    def test_summary_missing_keys(self):
        """workable_spec summary missing required keys should fail"""
        for missing_key in ["problem", "root_cause", "context"]:
            with self.subTest(missing_key=missing_key):
                payload = copy.deepcopy(self.payload)
                del payload["workable_spec"]["summary"][missing_key]
                with self.assertRaises(ValueError) as ctx:
                    validate_triage_result(payload)
                self.assertIn(missing_key, str(ctx.exception))

    def test_implementation_plan_missing_keys(self):
        """workable_spec implementation_plan missing required keys or invalid types should fail"""
        for missing_key in ["files_to_modify", "steps"]:
            with self.subTest(missing_key=missing_key):
                payload = copy.deepcopy(self.payload)
                del payload["workable_spec"]["implementation_plan"][missing_key]
                with self.assertRaises(ValueError) as ctx:
                    validate_triage_result(payload)
                self.assertIn(missing_key, str(ctx.exception))

    def test_testing_strategy_missing_keys(self):
        """workable_spec testing_strategy missing required keys should fail"""
        for missing_key in ["test_file", "expected_behavior", "verification_steps", "framework"]:
            with self.subTest(missing_key=missing_key):
                payload = copy.deepcopy(self.payload)
                del payload["workable_spec"]["testing_strategy"][missing_key]
                with self.assertRaises(ValueError) as ctx:
                    validate_triage_result(payload)
                self.assertIn(missing_key, str(ctx.exception))

if __name__ == "__main__":
    unittest.main()
