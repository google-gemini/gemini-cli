from flask import Flask, request, jsonify
from google.cloud import pubsub_v1
import json
import os

from auth.github import verify_github_signature
from db.issues_store import create_issue

app = Flask(__name__)

PROJECT_ID = os.environ.get("PROJECT_ID")
TOPIC_ID = os.environ.get("TOPIC_ID")
GITHUB_WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET").encode("utf-8")

publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path(PROJECT_ID, TOPIC_ID)

@app.route('/', methods=['GET'])
def hello():
    return "Hello World!"

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get("X-Hub-Signature-256")
    
    # Github Authentication
    if not verify_github_signature(request.data, signature, GITHUB_WEBHOOK_SECRET):
        print("Unauthorized: HMAC signature mismatch.")
        return jsonify({"status": "error", "message": "Invalid Signature"}), 401

    event_type = request.headers.get("X-GitHub-Event")
    payload = request.json
    action = payload.get("action")

    # Only process issues.opened events
    if event_type != "issues" or action != "opened":
        return jsonify({"status": "ignored", "reason": f"unsupported event/action combo: {event_type}.{action}"}), 200

    # Payload preprocessing
    raw_body = payload.get("issue", {}).get("body", "")
    sanitized_body = f"<untrusted_context>\n{raw_body}\n</untrusted_context>"
    processed_data = {
        "issue_number": payload.get("issue", {}).get("number"),
        "repository": payload.get("repository", {}).get("full_name"),
        "sender": payload.get("sender", {}).get("login"),
        "body": sanitized_body,
        "title": payload.get("issue", {}).get("title")
    }

    issue_number = processed_data["issue_number"]
    repository = processed_data["repository"]
    owner, repo = repository.split("/")
    title = processed_data["title"]
    
    create_issue(owner, repo, issue_number, title)
    
    # Publish to Pub/Sub
    data_bytes = json.dumps(processed_data).encode("utf-8")
    future = publisher.publish(topic_path, data_bytes)
    
    return jsonify({"status": "accepted", "message_id": future.result()}), 202

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
