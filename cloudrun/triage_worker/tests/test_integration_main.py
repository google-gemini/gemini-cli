"""
Integration tests for main.py.

NOTE: These tests check the python script logic (reading env vars, claiming locks, sending GitHub actions).
The actual AI response (process_issue_triage) is mocked out here.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import json
import base64
from main import main
from db.issues_store import ClaimAction, ReleaseAction

VALID_WORKABLE_SPEC = {
    "issue_id": "owner/repo#42",
    "summary": {"problem": "p", "root_cause": "r", "context": "c"},
    "implementation_plan": {"files_to_modify": ["src/app.ts"], "steps": ["Fix bug"]},
    "testing_strategy": {"test_file": "tests/app.test.ts", "expected_behavior": "Pass", "verification_steps": ["Check"], "framework": "Vitest"}
}

# Inline valid test payloads for integration test harness
INTEGRATION_OK_PAYLOAD = {
    "triage_metadata": {
        "quality": "OK",
        "reasoning": "Actionable bug report.",
        "comment": "",
        "effort_estimate": "SMALL",
        "effort_reasoning": "Easy fix."
    },
    "workable_spec": VALID_WORKABLE_SPEC
}

INTEGRATION_NEEDS_INFO_PAYLOAD = {
    "triage_metadata": {
        "quality": "NEEDS_INFO",
        "reasoning": "The issue reports a crash on startup, but lacks any actual details. There are no steps to reproduce the issue.",
        "comment": "Hi! Thanks for commenting on this issue, we need more information to triage the bug.",
        "effort_estimate": "",
        "effort_reasoning": ""
    },
    "workable_spec": {}
}

INTEGRATION_INVALID_EFFORT_PAYLOAD = {
    "triage_metadata": {
        "quality": "OK",
        "reasoning": "Some reasoning.",
        "comment": "",
        "effort_estimate": "HUGE",
        "effort_reasoning": "This will take a while to fix."
    },
    "workable_spec": VALID_WORKABLE_SPEC
}

class TestIntegrationMain(unittest.TestCase):

    def setUp(self):
        # Mock all env vars needed by main.py
        self.env_patcher = patch.dict(os.environ, {
            "ISSUE_DETAILS": base64.b64encode(json.dumps({
                "issue_number": 42,
                "repository": "owner/repo",
                "title": "Fix crash",
                "body": "App crashes on start"
            }).encode("utf-8")).decode("utf-8"),
            "WORKFLOW_EXECUTION_ID": "test-workflow-exec-101",
            "PROJECT_ID": "test-gcp-project",
            "EGRESS_TOPIC_ID": "test-egress-actions"
        })
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    @patch("main.acquire_lock")
    @patch("main.process_issue_triage")
    @patch("main.send_label_action")
    @patch("main.release_lock")
    def test_main_ok_quality_flow(self, mock_release_lock, mock_send_label, mock_triage, mock_acquire_lock):
        """integration test: end-to-end main execution for OK quality issue should apply effort label and exit 0"""
        mock_acquire_lock.return_value = ClaimAction.PROCEED
        # Mock triage will return preset payload with OK quality
        mock_triage.return_value = (True, json.dumps(INTEGRATION_OK_PAYLOAD)) 
        mock_release_lock.return_value = ReleaseAction.COMPLETE

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 0)
        mock_acquire_lock.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101")
        mock_send_label.assert_called_once_with("owner", "repo", 42, ["effort/small"])
        mock_release_lock.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=True, status="TRIAGED", workable_spec=INTEGRATION_OK_PAYLOAD["workable_spec"])

    @patch("main.acquire_lock")
    @patch("main.process_issue_triage")
    @patch("main.send_comment_action")
    @patch("main.release_lock")
    def test_main_needs_info_flow(self, mock_release_lock, mock_send_comment, mock_triage, mock_acquire_lock):
        """integration test: end-to-end main execution for NEEDS_INFO issue should post comment and exit 0"""
        mock_acquire_lock.return_value = ClaimAction.PROCEED
        mock_triage.return_value = (True, json.dumps(INTEGRATION_NEEDS_INFO_PAYLOAD))
        mock_release_lock.return_value = ReleaseAction.COMPLETE

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 0)
        mock_send_comment.assert_called_once_with("owner", "repo", 42, INTEGRATION_NEEDS_INFO_PAYLOAD["triage_metadata"]["comment"])
        mock_release_lock.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=True, status="NEEDS_INFO")

    @patch("main.acquire_lock")
    @patch("main.process_issue_triage")
    @patch("main.send_label_action")
    @patch("main.release_lock")
    def test_main_low_quality_flows(self, mock_release_lock, mock_send_label, mock_triage, mock_acquire_lock):
        """integration test: end-to-end main execution for SPAM, EMPTY, or FEATURE quality issues should apply low_quality label and exit 0"""
        for quality in ["SPAM", "EMPTY", "FEATURE"]:
            mock_acquire_lock.reset_mock()
            mock_triage.reset_mock()
            mock_send_label.reset_mock()
            mock_release_lock.reset_mock()

            mock_acquire_lock.return_value = ClaimAction.PROCEED
            payload = {"triage_metadata": {"quality": quality}}
            mock_triage.return_value = (True, json.dumps(payload))
            mock_release_lock.return_value = ReleaseAction.COMPLETE

            with self.assertRaises(SystemExit) as ctx:
                main()

            self.assertEqual(ctx.exception.code, 0)
            mock_send_label.assert_called_once_with("owner", "repo", 42, ["low_quality"])
            mock_release_lock.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=True, status="LOW_QUALITY")

    @patch("main.acquire_lock")
    @patch("main.process_issue_triage")
    @patch("main.release_lock")
    def test_main_validation_failure_triggers_retry(self, mock_release_lock, mock_triage, mock_acquire_lock):
        """integration test: validation failure during main execution should release lock as failure and exit 1"""
        mock_acquire_lock.return_value = ClaimAction.PROCEED
        mock_triage.return_value = (True, json.dumps(INTEGRATION_INVALID_EFFORT_PAYLOAD))
        mock_release_lock.return_value = ReleaseAction.RETRY

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 1)
        mock_release_lock.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=False)

if __name__ == "__main__":
    unittest.main()
