import os
import json
import base64
import sys

from triage_orchestrator import process_issue_triage
from utils.validator import validate_triage_result
from db.issues_store import acquire_lock, release_lock

def main():
    # Cloud Run Jobs inject data via environment variables
    encoded_data = os.environ.get("ISSUE_DETAILS")
    
    if not encoded_data:
        print("[PROD] Error: No data provided in ISSUE_DETAILS.")
        sys.exit(1)

    try:
        payload = json.loads(base64.b64decode(encoded_data))
    except Exception as e:
        print(f"[PROD] Error decoding payload: {e}")
        sys.exit(1)
    
    issue_number = payload.get("issue_number", "unknown")
    repository = payload.get("repository", "unknown/unknown")
    owner, repo = repository.split("/")
    
    lock_holder = os.environ.get("CLOUD_RUN_TASK_INDEX", "local-worker")
    
    # Claim the lock
    claim = acquire_lock(owner, repo, issue_number, lock_holder)
    action = claim.get("action")
    
    if action == "ACK":
        print(f"[WORKER] Issue #{issue_number} already handled. Exiting.")
        sys.exit(0)
    elif action == "NEEDS_HUMAN":
        print(f"[WORKER] Issue #{issue_number} requires human review. Exiting.")
        sys.exit(0)
        
    print(f"[WORKER] Starting triage for issue #{issue_number}...")
    success, raw_output = process_issue_triage(payload)
    
    if success:
        try:
            triage_result = json.loads(raw_output)
            validate_triage_result(triage_result)

            quality = triage_result.get("triage_metadata", {}).get("quality", "OK")
            workable_spec = triage_result.get("workable_spec", {})
            
            if quality in ["SPAM", "EMPTY", "NEEDS_INFO"]:
                print(f"[WORKER] Quality: {quality}. Transitioning status.")
                release_lock(owner, repo, issue_number, lock_holder, success=False, status_override=quality)
                sys.exit(0)
            else:
                release_lock(owner, repo, issue_number, lock_holder, success=True, workable_spec=workable_spec)
                print(f"[WORKER] Triage success.")
                sys.exit(0)
                
        except Exception as e:
            print(f"[WORKER] Validation failed: {e}")
            success = False
            
    if not success:
        release = release_lock(owner, repo, issue_number, lock_holder, success=False)
        sys.exit(1 if release.get("action") == "NACK" else 0)

if __name__ == "__main__":
    main()
