import os
from google.cloud import firestore

# Single client instance
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
def _create_issue_tx(transaction, doc_ref, owner: str, repo: str, issue_number: int, title: str) -> bool:
    """
    Transactional logic to check for existence and initialize an issue document.
    Ensures that multiple concurrent webhooks do not re-initialize the same issue.

    Parameters:
    - transaction: The active Firestore Transaction context.
    - doc_ref: DocumentReference of the issue to initialize.
    - owner: The GitHub owner name.
    - repo: The GitHub repository name.
    - issue_number: The GitHub issue number.
    - title: The title of the GitHub issue.

    Returns:
    - True if the document was created; False if it already existed.
    """
    snapshot = doc_ref.get(transaction=transaction)
    
    if not snapshot.exists:
        transaction.set(doc_ref, {
            "status": "UNTRIAGED",
            "triage_attempts": 0,
            "workable_spec": {},
            "lock": {
                "holder": None,
                "expires_at": None
            },
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "github_metadata": {
                "owner": owner,
                "repo": repo,
                "issue_number": issue_number,
                "title": title
            }
        })
        return True
    return False

def create_issue(owner: str, repo: str, issue_number: int, title: str) -> bool:
    """
    Initializes an issue document in a transaction.
    Protects against duplicate triage triggering from duplicate webhook deliveries.

    Parameters:
    - owner: The GitHub owner name.
    - repo: The GitHub repository name.
    - issue_number: The GitHub issue number.
    - title: The title of the GitHub issue.

    Returns:
    - True if the issue document was initialized, False if it already existed.
    """
    doc_ref = get_issue_ref(owner, repo, issue_number)
    transaction = db.transaction()
    return _create_issue_tx(transaction, doc_ref, owner, repo, issue_number, title)
