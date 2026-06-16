import os
from datetime import datetime, timedelta, timezone
from google.cloud import firestore

PROJECT_ID = os.environ.get("PROJECT_ID")
DATABASE_NAME = os.environ.get("FIRESTORE_DATABASE")
COLLECTION_NAME = os.environ.get("FIRESTORE_COLLECTION")
db = firestore.Client(project=PROJECT_ID, database=DATABASE_NAME)

def get_issue_ref(owner: str, repo: str, issue_number: int):
    """
    Generates the standardized Firestore DocumentReference for an issue.

    Parameters:
    - owner: The GitHub owner/organization name (e.g., 'google').
    - repo: The repository name (e.g., 'gemini-cli').
    - issue_number: The unique issue number identifier.

    Returns:
    - DocumentReference pointing to the issue document in Firestore.
    """
    doc_id = f"github_{owner}_{repo}_{issue_number}"
    return db.collection(COLLECTION_NAME).document(doc_id)

@firestore.transactional
def _acquire_lock_tx(transaction, doc_ref, lock_holder: str, lock_duration_sec: int) -> dict:
    """
    Transactional logic to claim a processing lock for a worker.
    Enforces idempotency, lock expiration, and the Two-Strike State Constraint.

    Parameters:
    - transaction: The active Firestore Transaction context.
    - doc_ref: DocumentReference of the target issue.
    - lock_holder: Unique identifier of the worker attempting to claim the lock.
    - lock_duration_sec: Duration in seconds before the lock automatically expires.

    Returns:
    - A dictionary containing the recommended action:
      - {"action": "PROCEED"}: Lock successfully acquired; start processing.
      - {"action": "ACK"}: Already processed, or locked by another active worker; ignore.
      - {"action": "NEEDS_HUMAN"}: Lock count exceeded; transition state and ignore.
    """
    snapshot = doc_ref.get(transaction=transaction)
    if not snapshot.exists:
        return {"action": "ACK"}
    
    data = snapshot.to_dict()
    current_status = data.get("status")
    attempts = data.get("triage_attempts", 0)
    
    # Early exit for terminal states
    if current_status in ["TRIAGED", "SPAM", "EMPTY", "NEEDS_INFO", "NEEDS_HUMAN"]:
        return {"action": "ACK"}

    if attempts >= 2:
        transaction.update(doc_ref, {
            "status": "NEEDS_HUMAN", 
            "updated_at": firestore.SERVER_TIMESTAMP
            })
        return {"action": "NEEDS_HUMAN"}

    lock = data.get("lock", {})
    now = datetime.now(timezone.utc)
    holder = lock.get("holder")
    expires_at = lock.get("expires_at")
    
    # Lock is active if holder is set and expires_at has not passed
    lock_is_active = holder is not None and (expires_at is not None and now <= expires_at)
    
    if current_status == "TRIAGING" and lock_is_active:
        return {"action": "ACK"}
        
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
    return {"action": "PROCEED"}

def acquire_lock(owner: str, repo: str, issue_number: int, lock_holder: str, lock_duration_sec: int = 900) -> dict:
    """
    Attempts to acquire the processing lock for an issue.
    """
    doc_ref = get_issue_ref(owner, repo, issue_number)
    transaction = db.transaction()
    return _acquire_lock_tx(transaction, doc_ref, lock_holder, lock_duration_sec)

@firestore.transactional
def _release_lock_tx(transaction, doc_ref, lock_holder: str, success: bool, workable_spec: dict = None, status_override: str = None) -> dict:
    """
    Transactional logic to release the lock and update status or retry counters.

    Parameters:
    - transaction: The active Firestore Transaction context.
    - doc_ref: DocumentReference of the target issue.
    - lock_holder: Unique identifier of the worker attempting to release the lock.
    - success: True if the triage processing succeeded, False otherwise.
    - workable_spec: Optional dictionary containing the resulting workable specification on success.
    - status_override: Optional string to explicitly set the status (e.g. 'NEEDS_INFO', 'NEEDS_HUMAN').

    Returns:
    - A dictionary containing the recommended action:
      - {"action": "ACK"}: Clear from queue (successful release or max attempts reached).
      - {"action": "NACK"}: Revert to untriaged; trigger Pub/Sub message retry.
    """
    snapshot = doc_ref.get(transaction=transaction)
    if not snapshot.exists:
        return {"action": "ACK"}
        
    data = snapshot.to_dict()
    lock = data.get("lock", {})

    if lock.get("holder") != lock_holder:
        return {"action": "ACK"}
        
    updates = {
        "lock.holder": None,
        "lock.expires_at": None,
        "updated_at": firestore.SERVER_TIMESTAMP
    }
    
    if success:
        updates["status"] = status_override or "TRIAGED"
        updates["workable_spec"] = workable_spec or {}
        transaction.update(doc_ref, updates)
        return {"action": "ACK"}
    else:
        if status_override:
            updates["status"] = status_override
            transaction.update(doc_ref, updates)
            return {"action": "ACK"}
        attempts = data.get("triage_attempts", 0)
        if attempts >= 2:
            updates["status"] = "NEEDS_HUMAN"
            transaction.update(doc_ref, updates)
            return {"action": "ACK"}
        else:
            updates["status"] = "UNTRIAGED"
            transaction.update(doc_ref, updates)
            return {"action": "NACK"}

def release_lock(owner: str, repo: str, issue_number: int, lock_holder: str, success: bool, workable_spec: dict = None, status_override: str = None) -> dict:
    """
    Releases the processing lock for an issue and updates its status.
    """
    doc_ref = get_issue_ref(owner, repo, issue_number)
    transaction = db.transaction()
    return _release_lock_tx(transaction, doc_ref, lock_holder, success, workable_spec, status_override)
