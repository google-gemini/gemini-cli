import os
import json
import base64
import sys

from google.cloud import firestore
from triage_orchestrator import process_issue_triage
from utils.validator import validate_triage_result
from utils.egress import send_label_action, send_comment_action
from db.issues_store import IssuesStore, ClaimAction, ReleaseAction


def main() -> None:
    """
    Orchestrates the Cloud Run Job execution loop for Caretaker Triage.

    Assumptions:
        - Assumes ISSUE_DETAILS env var contains base64-encoded JSON payload.
        - Assumes WORKFLOW_EXECUTION_ID contains unique lock holder ID.
    """
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
    
    try:
        issue_number = int(payload.get("issue_number"))
    except (TypeError, ValueError):
        print("[PROD] Error: issue_number is not a valid number. Exiting.")
        sys.exit(1)

    try:
        owner, repo = payload.get("repository", "").split("/")
        if not owner or not repo:
            raise ValueError
    except (TypeError, ValueError):
        print("[PROD] Error: Malformed repository format (expected 'owner/repo'). Exiting.")
        sys.exit(1)

    lock_holder = os.environ.get("WORKFLOW_EXECUTION_ID", "local-exec")
    
    # Initialize Firestore Client & IssuesStore
    project_id = os.environ.get("PROJECT_ID")
    db_id = os.environ.get("FIRESTORE_DATABASE")
    collection_name = os.environ.get("FIRESTORE_COLLECTION", "issues")
    
    db_client = firestore.Client(project=project_id, database=db_id)
    store = IssuesStore(db_client, collection_name)

    # Claim the lock
    claim_action = store.acquire_lock(owner, repo, issue_number, lock_holder)
    
    if claim_action == ClaimAction.SKIP:
        print(
            f"[WORKER] Issue #{issue_number} already handled or active lock "
            "present. Exiting."
        )
        sys.exit(0)
    elif claim_action == ClaimAction.NEEDS_HUMAN:
        print(f"[WORKER] Issue #{issue_number} requires human review. Exiting.")
        sys.exit(0)
        
    print(f"[WORKER] Starting triage for issue #{issue_number}...")
    try:
        success, raw_output = process_issue_triage(payload)
    except Exception as e:
        print(f"[WORKER] Triage process failed with exception: {e}")
        success, raw_output = False, ""
    
    if success:
        try:
            triage_result = json.loads(raw_output)
            validate_triage_result(triage_result)

            quality = triage_result.get("triage_metadata", {}).get("quality")
            workable_spec = triage_result.get("workable_spec", {})
            
            if quality in ["SPAM", "EMPTY", "FEATURE"]:
                print(f"[WORKER] Quality: {quality}. Applying auto-close label.")
                send_label_action(owner, repo, issue_number, ["auto-close"])
                store.release_lock(
                    owner,
                    repo,
                    issue_number,
                    lock_holder,
                    success=True,
                    status="AUTO_CLOSE",
                )
                sys.exit(0)
            elif quality == "NEEDS_INFO":
                print(f"[WORKER] Quality: NEEDS_INFO. Leaving comment.")
                comment_body = (
                    triage_result.get("triage_metadata", {})
                    .get("comment", "")
                    .strip()
                )
                send_comment_action(owner, repo, issue_number, comment_body)
                store.release_lock(
                    owner,
                    repo,
                    issue_number,
                    lock_holder,
                    success=True,
                    status="NEEDS_INFO",
                )
                sys.exit(0)
            else:
                effort = triage_result.get("triage_metadata", {}).get(
                    "effort_estimate"
                )
                print(
                    f"[WORKER] Quality: OK. Effort: {effort}. Applying "
                    "effort label."
                )
                send_label_action(
                    owner, repo, issue_number, [f"effort/{effort.lower()}"]
                )
                store.release_lock(
                    owner,
                    repo,
                    issue_number,
                    lock_holder,
                    success=True,
                    status="TRIAGED",
                    workable_spec=workable_spec,
                )
                print(f"[WORKER] Triage success.")
                sys.exit(0)
                
        except Exception as e:
            print(f"[WORKER] Validation failed: {e}")
            success = False
    
    # If an exception happens in json.loads or validate_triage_result 
    # If LLM inference itself fails inside process_issue_triage
    if not success:
        release_action = store.release_lock(
            owner, repo, issue_number, lock_holder, success=False
        )
        sys.exit(1 if release_action == ReleaseAction.RETRY else 0)


if __name__ == "__main__":
    main()
