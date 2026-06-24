import os
import json
import base64
import sys
    
from triage_orchestrator import process_issue_triage
from utils.validator import validate_triage_result
from utils.egress import publish_egress_action
from db.issues_store import acquire_lock, release_lock, ClaimAction, ReleaseAction

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
    if "/" not in repository:
        print(f"[PROD] Error: Malformed repository format '{repository}'. Exiting.")
        sys.exit(1)
    owner, repo = repository.split("/")
    lock_holder = os.environ.get("WORKFLOW_EXECUTION_ID", "local-exec")
    
    # Claim the lock
    claim_action = acquire_lock(owner, repo, issue_number, lock_holder)
    
    if claim_action == ClaimAction.SKIP:
        print(f"[WORKER] Issue #{issue_number} already handled or active lock present. Exiting.")
        sys.exit(0)
    elif claim_action == ClaimAction.NEEDS_HUMAN:
        print(f"[WORKER] Issue #{issue_number} requires human review. Exiting.")
        sys.exit(0)
        
    print(f"[WORKER] Starting triage for issue #{issue_number}...")
    success, raw_output = process_issue_triage(payload)
    
    if success:
        try:
            triage_result = json.loads(raw_output)
            validate_triage_result(triage_result)

            quality = triage_result.get("triage_metadata", {}).get("quality")
            workable_spec = triage_result.get("workable_spec", {})
            
            if quality in ["SPAM", "EMPTY", "FEATURE"]:
                print(f"[WORKER] Quality: {quality}. Publishing to egress to apply low_quality label.")
                publish_egress_action({
                    "action": "LABEL",
                    "payload": {
                        "owner": owner,
                        "repo": repo,
                        "issueNumber": issue_number,
                        "labels": ["low_quality"]
                    }
                })
                release_lock(owner, repo, issue_number, lock_holder, success=True, status="LOW_QUALITY")
                sys.exit(0)
            elif quality == "NEEDS_INFO":
                print(f"[WORKER] Quality: NEEDS_INFO. Publishing to egress to leave a comment.")
                missing_info = triage_result.get("triage_metadata", {}).get("missing_info", "")
                comment_body = f"Hi! Thanks for commenting on this issue, we need more information to triage the bug.\n\n{missing_info}".strip()
                publish_egress_action({
                    "action": "COMMENT",
                    "payload": {
                        "owner": owner,
                        "repo": repo,
                        "issueNumber": issue_number,
                        "commentBody": comment_body
                    }
                })
                release_lock(owner, repo, issue_number, lock_holder, success=True, status="NEEDS_INFO")
                sys.exit(0)
            else:
                release_lock(owner, repo, issue_number, lock_holder, success=True, status="TRIAGED", workable_spec=workable_spec)
                print(f"[WORKER] Triage success.")
                sys.exit(0)
                
        except Exception as e:
            print(f"[WORKER] Validation failed: {e}")
            success = False
    
    # If an exception happens in json.loads or validate_triage_result 
    # If LLM inference itself fails inside process_issue_triage
    if not success:
        release_action = release_lock(owner, repo, issue_number, lock_holder, success=False)
        sys.exit(1 if release_action == ReleaseAction.RETRY else 0)

if __name__ == "__main__":
    main()
