import os
import json
from google.cloud import pubsub_v1

PROJECT_ID = os.environ.get("PROJECT_ID")
EGRESS_TOPIC_ID = os.environ.get("EGRESS_TOPIC_ID")

def _publish_egress_action(egress_event: dict) -> None:
    """
    [Internal] Publishes an EgressEvent JSON payload to the egress-actions Pub/Sub topic.
    """
    if not PROJECT_ID or not EGRESS_TOPIC_ID:
        print(f"[WORKER] Warning: Missing PROJECT_ID or EGRESS_TOPIC_ID (PROJECT_ID={PROJECT_ID}, EGRESS_TOPIC_ID={EGRESS_TOPIC_ID}), skipping egress publishing.")
        return
    try:
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(PROJECT_ID, EGRESS_TOPIC_ID)
        data = json.dumps(egress_event).encode("utf-8")
        future = publisher.publish(topic_path, data)
        message_id = future.result()
        print(f"[WORKER] Published egress action to Pub/Sub ({EGRESS_TOPIC_ID}). Message ID: {message_id}")
    except Exception as e:
        print(f"[WORKER] Error publishing to Pub/Sub: {e}")

def send_label_action(owner: str, repo: str, issue_number: int, labels: list[str]) -> None:
    """
    Helper to publish a LABEL action to egress.
    """
    _publish_egress_action({
        "action": "LABEL",
        "payload": {
            "owner": owner,
            "repo": repo,
            "issueNumber": issue_number,
            "labels": labels
        }
    })

def send_comment_action(owner: str, repo: str, issue_number: int, comment_body: str) -> None:
    """
    Helper to publish a COMMENT action to egress.
    """
    _publish_egress_action({
        "action": "COMMENT",
        "payload": {
            "owner": owner,
            "repo": repo,
            "issueNumber": issue_number,
            "commentBody": comment_body
        }
    })
