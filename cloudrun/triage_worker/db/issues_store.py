import os
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

PROJECT_ID = os.environ.get("PROJECT_ID")
DATABASE_NAME = os.environ.get("FIRESTORE_DATABASE")
COLLECTION_NAME = os.environ.get("FIRESTORE_COLLECTION")
db = firestore.Client(project=PROJECT_ID, database=DATABASE_NAME)

def get_issue_ref(owner: str, repo: str, issue_number: int):
    """
    Generates the standardized Firestore DocumentReference for an issue.
    """
    doc_id = f"github_{owner}_{repo}_{issue_number}"
    return db.collection(COLLECTION_NAME).document(doc_id)

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
    if current_status in ["TRIAGED", "LOW_QUALITY", "NEEDS_INFO", "NEEDS_HUMAN"]:
        return ClaimAction.SKIP

    if attempts >= 2:
        transaction.update(doc_ref, {
            "status": "NEEDS_HUMAN", 
            "updated_at": firestore.SERVER_TIMESTAMP
            })
        return ClaimAction.NEEDS_HUMAN

    lock = data.get("lock", {})
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

def acquire_lock(owner: str, repo: str, issue_number: int, lock_holder: str, lock_duration_sec: int = 900) -> ClaimAction:
    """
    Attempts to acquire the processing lock for an issue.
    """
    doc_ref = get_issue_ref(owner, repo, issue_number)
    transaction = db.transaction()
    return _acquire_lock_tx(transaction, doc_ref, lock_holder, lock_duration_sec)

@firestore.transactional
def _release_lock_tx(transaction, doc_ref, lock_holder: str, success: bool, workable_spec: dict = None, status: str = None) -> ReleaseAction:
    """
    Transactional logic to release the lock and update status or retry counters.
    """
    snapshot = doc_ref.get(transaction=transaction)
    if not snapshot.exists:
        return ReleaseAction.COMPLETE
        
    data = snapshot.to_dict()
    lock = data.get("lock", {})

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
    else:
        attempts = data.get("triage_attempts", 0)
        if attempts < 2:
            # Trigger retry
            updates["status"] = "UNTRIAGED"
            transaction.update(doc_ref, updates)
            return ReleaseAction.RETRY
        else:
            updates["status"] = "NEEDS_HUMAN"
            transaction.update(doc_ref, updates)
            return ReleaseAction.COMPLETE

def release_lock(owner: str, repo: str, issue_number: int, lock_holder: str, success: bool, workable_spec: dict = None, status: str = None) -> ReleaseAction:
    """
    Releases the processing lock for an issue and updates its status.
    """
    doc_ref = get_issue_ref(owner, repo, issue_number)
    transaction = db.transaction()
    return _release_lock_tx(transaction, doc_ref, lock_holder, success, workable_spec, status)
