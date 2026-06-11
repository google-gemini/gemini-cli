from flask import Flask, request, jsonify
from google.cloud import pubsub_v1
import json
import os

# Requires PYTHONPATH=. to be set in Cloud Run
from shared.github_auth import verify_github_signature
from db.issues_store import create_issue

app = Flask(__name__)

PROJECT_ID = os.environ.get("PROJECT_ID")
TOPIC_ID = os.environ.get("TOPIC_ID")
GITHUB_SECRET = os.environ.get("GITHUB_SECRET", "").encode("utf-8")

publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path(PROJECT_ID, TOPIC_ID)

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get("X-Hub-Signature-256")

    if not verify_github_signature(request.data, signature, GITHUB_SECRET):
        print("Unauthorized: HMAC signature mismatch.")
        return jsonify({"status": "error", "message": "Invalid Signature"}), 401

    event_type = request.headers.get("X-GitHub-Event")
    payload = request.json
    action = payload.get("action")

    print(f"Received {event_type} event with {action} action.")

    return jsonify({"status": "success", "message": "Webhook received"}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
