import os
import json
from typing import TypedDict, Literal, Union
from google.cloud import pubsub_v1


class BasePayload(TypedDict):
    owner: str
    repo: str
    issueNumber: int


class LabelPayload(BasePayload):
    labels: list[str]


class CommentPayload(BasePayload):
    commentBody: str


class LabelEvent(TypedDict):
    action: Literal["LABEL"]
    payload: LabelPayload


class CommentEvent(TypedDict):
    action: Literal["COMMENT"]
    payload: CommentPayload


EgressEvent = Union[LabelEvent, CommentEvent]


def _publish_egress_action(egress_event: EgressEvent) -> None:
    """
    [Internal] Publishes an EgressEvent JSON payload to Pub/Sub.
    """
    project_id = os.environ.get("PROJECT_ID")
    egress_topic_id = os.environ.get("EGRESS_TOPIC_ID")

    if not project_id or not egress_topic_id:
        print(
            f"[WORKER] Warning: Missing PROJECT_ID ({project_id}) or "
            f"EGRESS_TOPIC_ID ({egress_topic_id}), skipping egress."
        )
        return
    try:
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project_id, egress_topic_id)
        data = json.dumps(egress_event).encode("utf-8")
        future = publisher.publish(topic_path, data)
        message_id = future.result()
        print(
            f"[WORKER] Published egress action to Pub/Sub ({egress_topic_id}). "
            f"Message ID: {message_id}"
        )
    except Exception as e:
        print(f"[WORKER] Error publishing to Pub/Sub: {e}")
        raise


def send_label_action(
    owner: str, repo: str, issue_number: int, labels: list[str]
) -> None:
    """
    Helper to publish a LABEL action to egress.
    """
    _publish_egress_action({
        "action": "LABEL",
        "payload": {
            "owner": owner,
            "repo": repo,
            "issueNumber": issue_number,
            "labels": labels,
        },
    })


def send_comment_action(
    owner: str, repo: str, issue_number: int, comment_body: str
) -> None:
    """
    Helper to publish a COMMENT action to egress.
    """
    _publish_egress_action({
        "action": "COMMENT",
        "payload": {
            "owner": owner,
            "repo": repo,
            "issueNumber": issue_number,
            "commentBody": comment_body,
        },
    })
