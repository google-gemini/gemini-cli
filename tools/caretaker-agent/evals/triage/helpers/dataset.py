"""Firestore Golden Dataset Streaming"""

import os
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
from google.cloud import firestore

load_dotenv()


def get_env_var(name: str) -> str:
    """Helper that loads an environment variable and fails fast if missing."""
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"Missing required environment variable '{name}'. "
            f"Please ensure your .env file or environment is properly configured."
        )
    return val


def load_issues(filter_issues: Optional[List[int]] = None) -> List[Dict[str, Any]]:
    """Loads golden issue test cases directly from Firestore into memory."""
    project_id = get_env_var("PROJECT_ID")
    db_id = get_env_var("FIRESTORE_DATABASE")
    collection_name = get_env_var("FIRESTORE_EVAL_COLLECTION")

    db = firestore.Client(project=project_id, database=db_id)
    docs = db.collection(collection_name).stream()

    issues = []
    for doc in docs:
        data = doc.to_dict()
        issue_num = data.get("issue_number")
        if issue_num is None:
            print(f"⚠️ Warning: Firestore document '{doc.id}' missing 'issue_number'. Skipping.")
            continue
        data["issue_number"] = int(issue_num)
        if filter_issues and data["issue_number"] not in filter_issues:
            continue
        issues.append(data)

    issues.sort(key=lambda x: x["issue_number"])
    return issues


def prep_payload(item: Dict[str, Any]) -> Dict[str, Any]:
    """Preprocesses and wraps title & body to simulate production Ingestion Layer safety encapsulation."""
    raw_body = item.get("issue_body") or ""
    escaped_body = raw_body.replace("</untrusted_context>", "\\</untrusted_context>")
    sanitized_body = f"<untrusted_context>\n{escaped_body}\n</untrusted_context>"

    raw_title = item.get("issue_title") or ""
    escaped_title = raw_title.replace("</untrusted_context>", "\\</untrusted_context>")
    sanitized_title = f"<untrusted_context>\n{escaped_title}\n</untrusted_context>"

    return {
        "issue_number": item.get("issue_number"),
        "title": sanitized_title,
        "body": sanitized_body,
        "repository": f"{item.get('owner', 'google-gemini')}/{item.get('repo', 'gemini-cli')}"
    }
