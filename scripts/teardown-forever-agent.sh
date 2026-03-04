#!/usr/bin/env bash
# teardown-forever-agent.sh — Remove all Forever Agent GCE resources.
#
# Usage: ./scripts/teardown-forever-agent.sh
#
# Optional env vars (defaults shown):
#   PROJECT      - GCP project ID (defaults to gcloud config)
#   REGION       - GCP region (default: us-central1)
#   ZONE         - GCP zone (default: us-central1-a)
#   VM_NAME      - VM name (default: forever-agent)
#   PUBSUB_TOPIC - Pub/Sub topic name (default: forever-agent-chat)
#   PUBSUB_SUB   - Pub/Sub subscription name (default: forever-agent-chat-sub)

set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-forever-agent}"
PUBSUB_TOPIC="${PUBSUB_TOPIC:-forever-agent-chat}"
PUBSUB_SUB="${PUBSUB_SUB:-forever-agent-chat-sub}"
IP_NAME="${VM_NAME}-ip"

echo "=== Tearing down Forever Agent ==="
echo "  Project: $PROJECT"
echo "  VM:      $VM_NAME ($ZONE)"
echo ""

read -p "Are you sure? This will delete the VM, static IP, and Pub/Sub resources. [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "--- Deleting VM..."
gcloud compute instances delete "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --quiet 2>/dev/null || echo "  VM not found"

echo "--- Releasing static IP..."
gcloud compute addresses delete "$IP_NAME" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || echo "  Static IP not found"

echo "--- Deleting Pub/Sub subscription..."
gcloud pubsub subscriptions delete "$PUBSUB_SUB" --project="$PROJECT" --quiet 2>/dev/null || echo "  Subscription not found"

echo "--- Deleting Pub/Sub topic..."
gcloud pubsub topics delete "$PUBSUB_TOPIC" --project="$PROJECT" --quiet 2>/dev/null || echo "  Topic not found"

echo ""
echo "=== Teardown complete ==="
echo "Note: The Google Chat app configuration must be removed manually from the GCP console."
