"""
Integration tests for main.py.

Verifies workflow execution across main.py and issues_store.py.
External network boundaries (Firestore database client and LLM inference) are mocked.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import json
import base64
import main as main_module
from main import main

VALID_WORKABLE_SPEC = {
    "issue_id": "owner/repo#42",
    "summary": {"problem": "p", "root_cause": "r", "context": "c"},
    "implementation_plan": {"files_to_modify": ["src/app.ts"], "steps": ["Fix bug"]},
    "testing_strategy": {"test_file": "tests/app.test.ts", "expected_behavior": "Pass", "verification_steps": ["Check"], "framework": "Vitest"}
}

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
        "reasoning": "The issue reports a crash on startup, but lacks any actual details.",
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
        # Mock environment variables
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

        # Mock the Firestore database client at the network boundary
        self.db_patcher = patch("db.issues_store.db")
        self.mock_db = self.db_patcher.start()

        self.mock_doc_ref = MagicMock()
        self.mock_snapshot = MagicMock()
        self.mock_transaction = MagicMock()

        self.mock_db.collection.return_value.document.return_value = self.mock_doc_ref
        self.mock_db.transaction.return_value = self.mock_transaction
        self.mock_doc_ref.get.return_value = self.mock_snapshot
        self.mock_snapshot.exists = True

        # In-memory document state simulation
        self.stored_data = {}
        self.mock_snapshot.to_dict.side_effect = lambda: self.stored_data

        def mock_update(doc_ref, updates):
            if "status" in updates:
                self.stored_data["status"] = updates["status"]
            if "workable_spec" in updates:
                self.stored_data["workable_spec"] = updates["workable_spec"]
            if "lock.holder" in updates:
                if "lock" not in self.stored_data:
                    self.stored_data["lock"] = {}
                self.stored_data["lock"]["holder"] = updates["lock.holder"]

        # Bind mock_update to execute whenever transaction.update is invoked
        self.mock_transaction.update.side_effect = mock_update

    def tearDown(self):
        self.db_patcher.stop()
        self.env_patcher.stop()

    @patch("main.process_issue_triage")
    @patch("main.send_label_action")
    @patch.object(main_module, "acquire_lock", wraps=main_module.acquire_lock)
    @patch.object(main_module, "release_lock", wraps=main_module.release_lock)
    def test_main_ok_quality_flow(self, mock_release, mock_acquire, mock_send_label, mock_triage):
        """Verifies end-to-end flow for OK quality issues."""
        self.stored_data = {
            "status": "UNTRIAGED",
            "triage_attempts": 0,
            "lock": {"holder": None, "expires_at": None}
        }
        mock_triage.return_value = (True, json.dumps(INTEGRATION_OK_PAYLOAD))

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 0)
        mock_acquire.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101")
        mock_release.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=True, status="TRIAGED", workable_spec=INTEGRATION_OK_PAYLOAD["workable_spec"])
        mock_send_label.assert_called_once_with("owner", "repo", 42, ["effort/small"])

        # Verify state transition in store data
        self.assertEqual(self.stored_data["status"], "TRIAGED")
        self.assertEqual(self.stored_data["workable_spec"], VALID_WORKABLE_SPEC)
        self.assertIsNone(self.stored_data["lock"]["holder"])

    @patch("main.process_issue_triage")
    @patch("main.send_comment_action")
    @patch.object(main_module, "acquire_lock", wraps=main_module.acquire_lock)
    @patch.object(main_module, "release_lock", wraps=main_module.release_lock)
    def test_main_needs_info_flow(self, mock_release, mock_acquire, mock_send_comment, mock_triage):
        """Verifies end-to-end flow for NEEDS_INFO issues."""
        self.stored_data = {
            "status": "UNTRIAGED",
            "triage_attempts": 0,
            "lock": {"holder": None, "expires_at": None}
        }
        mock_triage.return_value = (True, json.dumps(INTEGRATION_NEEDS_INFO_PAYLOAD))

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 0)
        mock_acquire.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101")
        mock_release.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=True, status="NEEDS_INFO")
        mock_send_comment.assert_called_once_with("owner", "repo", 42, INTEGRATION_NEEDS_INFO_PAYLOAD["triage_metadata"]["comment"])

        self.assertEqual(self.stored_data["status"], "NEEDS_INFO")
        self.assertIsNone(self.stored_data["lock"]["holder"])

    @patch("main.process_issue_triage")
    @patch("main.send_label_action")
    @patch.object(main_module, "acquire_lock", wraps=main_module.acquire_lock)
    @patch.object(main_module, "release_lock", wraps=main_module.release_lock)
    def test_main_low_quality_flows(self, mock_release, mock_acquire, mock_send_label, mock_triage):
        """Verifies end-to-end flow for low quality issues."""
        for quality in ["SPAM", "EMPTY", "FEATURE"]:
            mock_acquire.reset_mock()
            mock_release.reset_mock()
            mock_send_label.reset_mock()
            mock_triage.reset_mock()

            self.stored_data = {
                "status": "UNTRIAGED",
                "triage_attempts": 0,
                "lock": {"holder": None, "expires_at": None}
            }
            payload = {"triage_metadata": {"quality": quality}}
            mock_triage.return_value = (True, json.dumps(payload))

            with self.assertRaises(SystemExit) as ctx:
                main()

            self.assertEqual(ctx.exception.code, 0)
            mock_acquire.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101")
            mock_release.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=True, status="LOW_QUALITY")
            mock_send_label.assert_called_once_with("owner", "repo", 42, ["low_quality"])

            self.assertEqual(self.stored_data["status"], "LOW_QUALITY")
            self.assertIsNone(self.stored_data["lock"]["holder"])

    @patch("main.process_issue_triage")
    @patch.object(main_module, "acquire_lock", wraps=main_module.acquire_lock)
    @patch.object(main_module, "release_lock", wraps=main_module.release_lock)
    def test_main_validation_failure_triggers_retry(self, mock_release, mock_acquire, mock_triage):
        """Verifies retry state transition when validation fails."""
        self.stored_data = {
            "status": "UNTRIAGED",
            "triage_attempts": 0,
            "lock": {"holder": None, "expires_at": None}
        }
        mock_triage.return_value = (True, json.dumps(INTEGRATION_INVALID_EFFORT_PAYLOAD))

        with self.assertRaises(SystemExit) as ctx:
            main()

        self.assertEqual(ctx.exception.code, 1)
        mock_acquire.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101")
        mock_release.assert_called_once_with("owner", "repo", 42, "test-workflow-exec-101", success=False)
        self.assertEqual(self.stored_data["status"], "UNTRIAGED")
        self.assertIsNone(self.stored_data["lock"]["holder"])

if __name__ == "__main__":
    unittest.main()
