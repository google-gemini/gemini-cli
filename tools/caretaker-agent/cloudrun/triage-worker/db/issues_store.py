from enum import Enum
from datetime import datetime, timedelta, timezone
from google.cloud import firestore

class ClaimAction(Enum):
    """Result of lock claim attempt (PROCEED, SKIP, or NEEDS_HUMAN)."""
    PROCEED = "PROCEED"
    SKIP = "SKIP"
    NEEDS_HUMAN = "NEEDS_HUMAN"

class ReleaseAction(Enum):
    """
    Result of lock release, instructing worker process how to terminate:
    - COMPLETE: Task finished or reached terminal state (Exit code 0).
    - RETRY: Task failed with attempts < 2 (Exit code 1).
    """
    COMPLETE = "COMPLETE"
    RETRY = "RETRY"


class IssuesStore:
    """
    Manages Firestore database operations for the Caretaker Triage worker,
    handling transactional lock acquisition and release across issues.
    """
    def __init__(self, db: firestore.Client, collection_name: str):
        """
        Initializes the IssuesStore instance.

        Args:
            db: Firestore database client instance.
            collection_name: Target Firestore collection name.
        """
        self.db = db
        self.collection_name = collection_name

    def _get_issue_ref(self, owner: str, repo: str, issue_number: int | str):
        """
        Generates the standardized Firestore DocumentReference for an issue.

        Args:
            owner: GitHub repository owner name.
            repo: GitHub repository name.
            issue_number: GitHub issue number.

        Returns:
            DocumentReference formatted as 'github_{owner}_{repo}_{issue_number}'.
        """
        doc_id = f"github_{owner}_{repo}_{issue_number}"
        return self.db.collection(self.collection_name).document(doc_id)

    @staticmethod
    @firestore.transactional
    def _acquire_lock_tx(
        transaction, doc_ref, lock_holder: str, lock_duration_sec: int
    ) -> ClaimAction:
        """Internal transactional handler to claim a processing lock."""
        snapshot = doc_ref.get(transaction=transaction)
        if not snapshot.exists:
            return ClaimAction.SKIP
        
        data = snapshot.to_dict()
        current_status = data.get("status")
        attempts = data.get("triage_attempts", 0)
        
        # Early exit for terminal states
        terminal_states = {
            "TRIAGED", "AUTO_CLOSE", "NEEDS_INFO", "NEEDS_HUMAN"
        }
        if current_status in terminal_states:
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
        lock_is_active = (
            holder is not None
            and expires_at is not None
            and now <= expires_at
        )
        
        # If active lock by another workflow, ignore
        if (
            current_status == "TRIAGING"
            and lock_is_active
            and holder != lock_holder
        ):
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
        """
        Attempts to acquire a processing lock for an issue.

        Args:
            owner: GitHub repository owner name.
            repo: GitHub repository name.
            issue_number: GitHub issue number.
            lock_holder: Unique execution identifier string for the workflow
              handling the issue.
            lock_duration_sec: Lock duration in seconds.

        Assumptions:
            - Assumes the issue document was created upstream by the Ingestion
              Service. If the document does not exist, returns ClaimAction.SKIP.

        Returns:
            ClaimAction indicating whether execution should PROCEED, SKIP,
            or hand off to NEEDS_HUMAN.
        """
        doc_ref = self._get_issue_ref(owner, repo, issue_number)
        transaction = self.db.transaction()
        return self._acquire_lock_tx(
            transaction, doc_ref, lock_holder, lock_duration_sec
        )

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
        """Internal transactional handler to release processing lock."""
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
        """
        Releases the processing lock for an issue and updates its final status.

        Args:
            owner: GitHub repository owner name.
            repo: GitHub repository name.
            issue_number: GitHub issue number.
            lock_holder: Unique execution identifier string for the workflow
              handling the issue.
            success: Whether AI triage completed successfully.
            workable_spec: Parsed workable specification to persist when status
              is TRIAGED.
            status: Target issue status (TRIAGED, NEEDS_INFO, AUTO_CLOSE,
              or NEEDS_HUMAN).

        Returns:
            ReleaseAction indicating COMPLETE or RETRY.
        """
        doc_ref = self._get_issue_ref(owner, repo, issue_number)
        transaction = self.db.transaction()
        return self._release_lock_tx(
            transaction, doc_ref, lock_holder, success, workable_spec, status
        )
