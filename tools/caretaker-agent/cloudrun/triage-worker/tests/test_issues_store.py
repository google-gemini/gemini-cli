import unittest
from unittest.mock import MagicMock
from datetime import datetime, timedelta, timezone
from google.cloud import firestore
from db.issues_store import IssuesStore, ClaimAction, ReleaseAction

class TestIssuesStore(unittest.TestCase):

    def setUp(self):
        self.transaction = MagicMock()
        self.doc_ref = MagicMock(spec=firestore.DocumentReference)
        self.snapshot = MagicMock(spec=firestore.DocumentSnapshot)
        self.doc_ref.get.return_value = self.snapshot
        self.lock_holder = "worker-exec-1"

        self.mock_db = MagicMock(spec=firestore.Client)
        self.mock_db.transaction.return_value = self.transaction
        self.mock_db.collection.return_value.document.return_value = self.doc_ref
        self.store = IssuesStore(db=self.mock_db, collection_name="issues")

    # --- acquire_lock tests ---

    def test_acquire_lock_nonexistent_doc(self):
        """acquire lock on non-existent doc should skip triage"""
        self.snapshot.exists = False
        action = self.store.acquire_lock("owner", "repo", 123, self.lock_holder, 900)
        self.assertEqual(action, ClaimAction.SKIP)
        self.transaction.update.assert_not_called()

    def test_acquire_lock_terminal_states(self):
        """acquire lock on terminal status docs should skip triage"""
        terminal_statuses = ["TRIAGED", "AUTO_CLOSE", "NEEDS_INFO", "NEEDS_HUMAN"]
        self.snapshot.exists = True
        for status in terminal_statuses:
            with self.subTest(status=status):
                self.snapshot.to_dict.return_value = {"status": status, "triage_attempts": 0}
                action = self.store.acquire_lock("owner", "repo", 123, self.lock_holder, 900)
                self.assertEqual(action, ClaimAction.SKIP)
                self.transaction.update.assert_not_called()

    def test_acquire_lock_two_strikes_constraint(self):
        """acquire lock when attempts >= 2 should escalate to NEEDS_HUMAN"""
        self.snapshot.exists = True
        self.snapshot.to_dict.return_value = {"status": "UNTRIAGED", "triage_attempts": 2}
        
        action = self.store.acquire_lock("owner", "repo", 123, self.lock_holder, 900)
        
        self.assertEqual(action, ClaimAction.NEEDS_HUMAN)
        self.transaction.update.assert_called_once()
        args, _ = self.transaction.update.call_args
        self.assertEqual(args[1]["status"], "NEEDS_HUMAN")

    def test_acquire_lock_active_lock_by_other_holder(self):
        """acquire lock when active lock held by another worker should skip"""
        self.snapshot.exists = True
        now = datetime.now(timezone.utc)
        self.snapshot.to_dict.return_value = {
            "status": "TRIAGING",
            "triage_attempts": 1,
            "lock": {
                "holder": "other-worker-exec",
                "expires_at": now + timedelta(seconds=300)
            }
        }
        action = self.store.acquire_lock("owner", "repo", 123, self.lock_holder, 900)
        self.assertEqual(action, ClaimAction.SKIP)
        self.transaction.update.assert_not_called()

    def test_acquire_lock_expired_lock_by_other_holder(self):
        """acquire lock when active lock held by another worker has expired should proceed"""
        self.snapshot.exists = True
        past = datetime.now(timezone.utc) - timedelta(seconds=300)
        self.snapshot.to_dict.return_value = {
            "status": "TRIAGING",
            "triage_attempts": 1,
            "lock": {
                "holder": "other-worker-exec",
                "expires_at": past
            }
        }
        action = self.store.acquire_lock("owner", "repo", 123, self.lock_holder, 900)
        self.assertEqual(action, ClaimAction.PROCEED)
        self.transaction.update.assert_called_once()

    def test_acquire_lock_success_proceed(self):
        """acquire lock on untriaged doc should transition to TRIAGING and proceed"""
        self.snapshot.exists = True
        self.snapshot.to_dict.return_value = {"status": "UNTRIAGED", "triage_attempts": 0}
        
        action = self.store.acquire_lock("owner", "repo", 123, self.lock_holder, 900)
        
        self.assertEqual(action, ClaimAction.PROCEED)
        self.transaction.update.assert_called_once()
        args, _ = self.transaction.update.call_args
        updates = args[1]
        self.assertEqual(updates["status"], "TRIAGING")
        self.assertEqual(updates["triage_attempts"], 1)
        self.assertEqual(updates["lock.holder"], self.lock_holder)

    # --- release_lock tests ---

    def test_release_lock_nonexistent_doc(self):
        """release lock on non-existent doc should complete silently"""
        self.snapshot.exists = False
        action = self.store.release_lock("owner", "repo", 123, self.lock_holder, success=True)
        self.assertEqual(action, ReleaseAction.COMPLETE)
        self.transaction.update.assert_not_called()

    def test_release_lock_holder_mismatch(self):
        """release lock when caller is not the lock holder should complete without updating"""
        self.snapshot.exists = True
        self.snapshot.to_dict.return_value = {"lock": {"holder": "different-holder"}}
        action = self.store.release_lock("owner", "repo", 123, self.lock_holder, success=True)
        self.assertEqual(action, ReleaseAction.COMPLETE)
        self.transaction.update.assert_not_called()

    def test_release_lock_success_complete(self):
        """release lock on successful triage should update status and clear lock"""
        self.snapshot.exists = True
        self.snapshot.to_dict.return_value = {"lock": {"holder": self.lock_holder}}
        workable_spec = {"summary": "Plan"}
        
        action = self.store.release_lock(
            "owner", "repo", 123, self.lock_holder,
            success=True, workable_spec=workable_spec, status="TRIAGED"
        )
        
        self.assertEqual(action, ReleaseAction.COMPLETE)
        self.transaction.update.assert_called_once()
        args, _ = self.transaction.update.call_args
        updates = args[1]
        self.assertEqual(updates["status"], "TRIAGED")
        self.assertEqual(updates["workable_spec"], workable_spec)
        self.assertIsNone(updates["lock.holder"])
        self.assertIsNone(updates["lock.expires_at"])

    def test_release_lock_failure_triggers_retry(self):
        """release lock on failed triage with attempts < 2 should reset to UNTRIAGED and retry"""
        self.snapshot.exists = True
        self.snapshot.to_dict.return_value = {
            "lock": {"holder": self.lock_holder},
            "triage_attempts": 1,
        }
        
        action = self.store.release_lock("owner", "repo", 123, self.lock_holder, success=False)
        
        self.assertEqual(action, ReleaseAction.RETRY)
        self.transaction.update.assert_called_once()
        args, _ = self.transaction.update.call_args
        updates = args[1]
        self.assertEqual(updates["status"], "UNTRIAGED")

    def test_release_lock_failure_max_attempts_needs_human(self):
        """release lock on failed triage with attempts >= 2 should escalate to NEEDS_HUMAN"""
        self.snapshot.exists = True
        self.snapshot.to_dict.return_value = {
            "lock": {"holder": self.lock_holder},
            "triage_attempts": 2,
        }
        
        action = self.store.release_lock("owner", "repo", 123, self.lock_holder, success=False)
        
        self.assertEqual(action, ReleaseAction.COMPLETE)
        self.transaction.update.assert_called_once()
        args, _ = self.transaction.update.call_args
        updates = args[1]
        self.assertEqual(updates["status"], "NEEDS_HUMAN")

if __name__ == "__main__":
    unittest.main()
