"""
Unit tests for main.py execution loop.

Verifies input payload decoding, locking claim actions, LLM quality routing,
and exit codes for Cloud Run Jobs.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import json
import base64

from main import main
from db.issues_store import ClaimAction, ReleaseAction

VALID_SPEC = {
    "issue_id": "owner/repo#42",
    "summary": {"problem": "p", "root_cause": "r", "context": "c"},
    "implementation_plan": {
        "files_to_modify": ["src/app.ts"], "steps": ["Fix bug"]
    },
    "testing_strategy": {
        "test_file": "tests/app.test.ts",
        "expected_behavior": "Pass",
        "verification_steps": ["Check"],
        "framework": "Vitest"
    }
}


class TestMainExecutionLoop(unittest.TestCase):

    def setUp(self):
        payload = {
            "issue_number": 42,
            "repository": "owner/repo",
            "title": "Fix crash",
            "body": "App crashes on startup"
        }
        encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode()

        self.env_patcher = patch.dict(os.environ, {
            "ISSUE_DETAILS": encoded,
            "WORKFLOW_EXECUTION_ID": "exec-123",
            "PROJECT_ID": "test-project",
            "EGRESS_TOPIC_ID": "test-topic"
        })
        self.env_patcher.start()

        self.mock_store = MagicMock()
        self.store_patcher = patch(
            "main.IssuesStore", return_value=self.mock_store
        )
        self.store_patcher.start()

        self.db_patcher = patch("main.firestore.Client")
        self.db_patcher.start()

    def tearDown(self):
        self.db_patcher.stop()
        self.store_patcher.stop()
        self.env_patcher.stop()

    @patch.dict(os.environ, {"ISSUE_DETAILS": ""})
    def test_main_missing_issue_details_exits_one(self):
        """Missing ISSUE_DETAILS env var exits 1 to signal container error."""
        with self.assertRaises(SystemExit) as ctx:
            main()
        self.assertEqual(ctx.exception.code, 1)

    def test_main_claim_action_early_exits_zero(self):
        """SKIP and NEEDS_HUMAN claim actions exit 0 without retrying."""
        for action in [ClaimAction.SKIP, ClaimAction.NEEDS_HUMAN]:
            with self.subTest(action=action):
                self.mock_store.acquire_lock.return_value = action
                with self.assertRaises(SystemExit) as ctx:
                    main()
                self.assertEqual(ctx.exception.code, 0)

    @patch("main.process_issue_triage")
    @patch("main.send_label_action")
    def test_main_auto_close_quality_flow(self, mock_send_label, mock_triage):
        """SPAM/EMPTY/FEATURE issues dispatch auto-close label."""
        self.mock_store.acquire_lock.return_value = ClaimAction.PROCEED
        output = json.dumps({"triage_metadata": {"quality": "SPAM"}})
        mock_triage.return_value = (True, output)

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 0)
        mock_send_label.assert_called_once_with(
            "owner", "repo", 42, ["auto-close"]
        )
        self.mock_store.release_lock.assert_called_once_with(
            "owner", "repo", 42, "exec-123", success=True, status="AUTO_CLOSE"
        )

    @patch("main.process_issue_triage")
    @patch("main.send_comment_action")
    def test_main_needs_info_quality_flow(
        self, mock_send_comment, mock_triage
    ):
        """NEEDS_INFO issues dispatch comment action and release NEEDS_INFO."""
        self.mock_store.acquire_lock.return_value = ClaimAction.PROCEED
        output = json.dumps({
            "triage_metadata": {
                "quality": "NEEDS_INFO",
                "comment": "Please provide logs."
            }
        })
        mock_triage.return_value = (True, output)

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 0)
        mock_send_comment.assert_called_once_with(
            "owner", "repo", 42, "Please provide logs."
        )
        self.mock_store.release_lock.assert_called_once_with(
            "owner", "repo", 42, "exec-123", success=True, status="NEEDS_INFO"
        )

    @patch("main.process_issue_triage")
    @patch("main.send_label_action")
    def test_main_ok_quality_flow(self, mock_send_label, mock_triage):
        """OK quality issues dispatch effort label and release TRIAGED spec."""
        self.mock_store.acquire_lock.return_value = ClaimAction.PROCEED
        output = json.dumps({
            "triage_metadata": {"quality": "OK", "effort_estimate": "SMALL"},
            "workable_spec": VALID_SPEC
        })
        mock_triage.return_value = (True, output)

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 0)
        mock_send_label.assert_called_once_with(
            "owner", "repo", 42, ["effort/small"]
        )
        self.mock_store.release_lock.assert_called_once_with(
            "owner",
            "repo",
            42,
            "exec-123",
            success=True,
            status="TRIAGED",
            workable_spec=VALID_SPEC,
        )

    @patch("main.process_issue_triage")
    def test_main_failure_triggers_retry_release(self, mock_triage):
        """Process/egress failure releases lock success=False and exits 1."""
        self.mock_store.acquire_lock.return_value = ClaimAction.PROCEED
        mock_triage.return_value = (False, "LLM failed")
        self.mock_store.release_lock.return_value = ReleaseAction.RETRY

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 1)
        self.mock_store.release_lock.assert_called_once_with(
            "owner", "repo", 42, "exec-123", success=False
        )


if __name__ == "__main__":
    unittest.main()
