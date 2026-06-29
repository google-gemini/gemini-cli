from enum import Enum
from datetime import datetime, timedelta, timezone
from google.cloud import firestore

class ClaimAction(Enum):
    PROCEED = "PROCEED"
    SKIP = "SKIP"
    NEEDS_HUMAN = "NEEDS_HUMAN"

class ReleaseAction(Enum):
    COMPLETE = "COMPLETE"  # Complete / no retry needed (Exit code 0)
    RETRY = "RETRY"        # Failed / trigger retry (Exit code 1)


class IssuesStore:
    def __init__(self, db: firestore.Client, collection_name: str):
        self.db = db
        self.collection_name = collection_name

    def _get_issue_ref(self, owner: str, repo: str, issue_number: int | str):
        """Generates the standardized Firestore DocumentReference for an issue."""
        doc_id = f"github_{owner}_{repo}_{issue_number}"
        return self.db.collection(self.collection_name).document(doc_id)

    @staticmethod
    @firestore.transactional
    def _acquire_lock_tx(transaction, doc_ref, lock_holder: str, lock_duration_sec: int) -> ClaimAction:
        """
        Transactional logic to claim a processing lock for a worker.
        Enforces idempotency, lock expiration, and the Two-Strike State Constraint.
        """
        snapshot = doc_ref.get(transaction=transaction)
        if not snapshot.exists:
            return ClaimAction.SKIP
        
        data = snapshot.to_dict()
        current_status = data.get("status")
        attempts = data.get("triage_attempts", 0)
        
        # Early exit for terminal states
        if current_status in {"TRIAGED", "LOW_QUALITY", "NEEDS_INFO", "NEEDS_HUMAN"}:
            return ClaimAction.SKIP

        if attempts >= 2:
            transaction.update(doc_ref, {
                "status": "NEEDS_HUMAN", 
                "updated_at": firestore.SERVER_TIMESTAMP
            })
            return ClaimAction.NEEDS_HUMAN

        lock = data.get("lock") or {}
        now = datetime.now(timezone.utc)
        holder = lock.get("holder")
        expires_at = lock.get("expires_at")
        
        # Lock is active if holder is set and expires_at has not passed
        lock_is_active = holder is not None and (expires_at is not None and now <= expires_at)
        
        # If active lock by another workflow, ignore
        if current_status == "TRIAGING" and lock_is_active and holder != lock_holder:
            return ClaimAction.SKIP
            
        # Attempt to claim
        new_expires_at = now + timedelta(seconds=lock_duration_sec)
        new_attempts = attempts + 1
        
        transaction.update(doc_ref, {
            "status": "TRIAGING",
            "triage_attempts": new_attempts,
            "lock.holder": lock_holder,
            "lock.expires_at": new_expires_at,
            "updated_at": firestore.SERVER_TIMESTAMP
        })
        return ClaimAction.PROCEED

    def acquire_lock(
        self,
        owner: str,
        repo: str,
        issue_number: int,
        lock_holder: str,
        lock_duration_sec: int = 900,
    ) -> ClaimAction:
        """Attempts to acquire the processing lock for an issue."""
        doc_ref = self._get_issue_ref(owner, repo, issue_number)
        transaction = self.db.transaction()
        return self._acquire_lock_tx(transaction, doc_ref, lock_holder, lock_duration_sec)

    @staticmethod
    @firestore.transactional
    def _release_lock_tx(
        transaction,
        doc_ref,
        lock_holder: str,
        success: bool,
        workable_spec: dict = None,
        status: str = None,
    ) -> ReleaseAction:
        """Transactional logic to release the lock and update status based on execution outcome."""
        snapshot = doc_ref.get(transaction=transaction)
        if not snapshot.exists:
            return ReleaseAction.COMPLETE
            
        data = snapshot.to_dict()
        lock = data.get("lock") or {}

        if lock.get("holder") != lock_holder:
            return ReleaseAction.COMPLETE
            
        updates = {
            "lock.holder": None,
            "lock.expires_at": None,
            "updated_at": firestore.SERVER_TIMESTAMP
        }
        
        if success:
            updates["status"] = status
            updates["workable_spec"] = workable_spec or {}
            transaction.update(doc_ref, updates)
            return ReleaseAction.COMPLETE
        
        attempts = data.get("triage_attempts", 0)
        if attempts < 2:
            # Trigger retry
            updates["status"] = "UNTRIAGED"
            transaction.update(doc_ref, updates)
            return ReleaseAction.RETRY
        
        updates["status"] = "NEEDS_HUMAN"
        transaction.update(doc_ref, updates)
        return ReleaseAction.COMPLETE

    def release_lock(
        self,
        owner: str,
        repo: str,
        issue_number: int,
        lock_holder: str,
        success: bool,
        workable_spec: dict = None,
        status: str = None,
    ) -> ReleaseAction:
        """Releases the processing lock for an issue and updates its status."""
        doc_ref = self._get_issue_ref(owner, repo, issue_number)
        transaction = self.db.transaction()
        return self._release_lock_tx(transaction, doc_ref, lock_holder, success, workable_spec, status)
