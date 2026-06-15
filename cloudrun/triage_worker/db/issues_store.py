def acquire_lock(owner, repo, issue_number, lock_holder):
    print(f"[DB] Attempting to acquire lock for {owner}/{repo}#{issue_number}")
    # Placeholder: In prod, check Firestore for an existing active lock or completed status.
    return {"action": "PROCEED"} 

def release_lock(owner, repo, issue_number, lock_holder, success=True, status_override=None, workable_spec=None):
    print(f"[DB] Releasing lock for #{issue_number}. Success: {success}")
    return {"action": "ACK"}
