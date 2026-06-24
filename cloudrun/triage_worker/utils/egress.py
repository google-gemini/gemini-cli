import os
import json
from google.cloud import pubsub_v1

PROJECT_ID = os.environ.get("PROJECT_ID")
EGRESS_TOPIC_ID = os.environ.get("EGRESS_TOPIC_ID")

def publish_egress_action(egress_event: dict) -> None:
    """
    Publishes an EgressEvent JSON payload to the egress-actions Pub/Sub topic.
    """
    if not PROJECT_ID:
        print("[WORKER] Warning: PROJECT_ID not set, skipping egress publishing.")
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
