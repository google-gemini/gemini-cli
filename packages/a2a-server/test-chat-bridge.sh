#!/bin/bash
# Test script for the Google Chat bridge webhook endpoint.
# Simulates Google Chat events to verify the bridge works.
#
# Usage: ./test-chat-bridge.sh [PORT]
# Default port: 9090 (for kubectl port-forward)

PORT=${1:-9090}
BASE_URL="http://localhost:${PORT}"

echo "Testing chat bridge at ${BASE_URL}..."

# 1. Test health endpoint
echo -e "\n--- Health Check ---"
curl -s "${BASE_URL}/chat/health" | jq .

# 2. Test ADDED_TO_SPACE event
echo -e "\n--- ADDED_TO_SPACE ---"
curl -s -X POST "${BASE_URL}/chat/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ADDED_TO_SPACE",
    "eventTime": "2026-01-01T00:00:00Z",
    "space": { "name": "spaces/test123", "type": "DM" },
    "user": { "name": "users/123", "displayName": "Test User" }
  }' | jq .

# 3. Test MESSAGE event
echo -e "\n--- MESSAGE (Hello) ---"
curl -s -X POST "${BASE_URL}/chat/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MESSAGE",
    "eventTime": "2026-01-01T00:01:00Z",
    "message": {
      "name": "spaces/test123/messages/msg1",
      "sender": { "name": "users/123", "displayName": "Test User" },
      "createTime": "2026-01-01T00:01:00Z",
      "text": "Hello, write me a python hello world",
      "argumentText": "Hello, write me a python hello world",
      "thread": { "name": "spaces/test123/threads/thread1" },
      "space": { "name": "spaces/test123", "type": "DM" }
    },
    "space": { "name": "spaces/test123", "type": "DM" },
    "user": { "name": "users/123", "displayName": "Test User" }
  }' | jq .

echo -e "\nDone."
