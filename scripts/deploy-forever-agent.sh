#!/usr/bin/env bash
# deploy-forever-agent.sh — One-command deployment of Gemini CLI Forever Agent on GCE.
#
# Creates a GCE VM running Gemini CLI in --forever mode with a Google Chat bridge
# via Cloud Pub/Sub. The agent auto-resumes tasks (Sisyphus mode) and runs in YOLO
# (auto-approve all tools).
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - A Google Cloud project with billing enabled
#   - A Gemini API key (from aistudio.google.com)
#   - A Google Chat app configured (see instructions printed at the end)
#
# Usage:
#   export GEMINI_API_KEY="your-api-key"
#   ./scripts/deploy-forever-agent.sh
#
# Optional env vars (defaults shown):
#   PROJECT          - GCP project ID (defaults to gcloud config)
#   REGION           - GCP region (default: us-central1)
#   ZONE             - GCP zone (default: us-central1-a)
#   VM_NAME          - VM name (default: forever-agent)
#   MACHINE_TYPE     - VM machine type (default: e2-medium)
#   GIT_BRANCH       - Branch to clone (default: afw/forever-gchat)
#   PUBSUB_TOPIC     - Pub/Sub topic name (default: forever-agent-chat)
#   PUBSUB_SUB       - Pub/Sub subscription name (default: forever-agent-chat-sub)

set -euo pipefail

# --- Configuration ---

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-forever-agent}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-medium}"
GIT_BRANCH="${GIT_BRANCH:-afw/forever-gchat}"
PUBSUB_TOPIC="${PUBSUB_TOPIC:-forever-agent-chat}"
PUBSUB_SUB="${PUBSUB_SUB:-forever-agent-chat-sub}"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "ERROR: GEMINI_API_KEY is required. Get one from https://aistudio.google.com"
  echo "Usage: GEMINI_API_KEY=... ./scripts/deploy-forever-agent.sh"
  exit 1
fi

if [ -z "$PROJECT" ]; then
  echo "ERROR: No GCP project set. Run: gcloud config set project YOUR_PROJECT"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STARTUP_SCRIPT="${SCRIPT_DIR}/gce-startup.sh"

if [ ! -f "$STARTUP_SCRIPT" ]; then
  echo "ERROR: Startup script not found at $STARTUP_SCRIPT"
  exit 1
fi

echo "=== Deploying Gemini CLI Forever Agent ==="
echo "  Project:      $PROJECT"
echo "  Zone:         $ZONE"
echo "  VM:           $VM_NAME ($MACHINE_TYPE)"
echo "  Branch:       $GIT_BRANCH"
echo "  Pub/Sub:      $PUBSUB_TOPIC / $PUBSUB_SUB"
echo ""

# --- Enable required APIs ---

echo "--- Enabling APIs..."
gcloud services enable \
  compute.googleapis.com \
  pubsub.googleapis.com \
  chat.googleapis.com \
  --project="$PROJECT" --quiet

# --- Create Pub/Sub topic + subscription ---

echo "--- Setting up Pub/Sub..."
if ! gcloud pubsub topics describe "$PUBSUB_TOPIC" --project="$PROJECT" &>/dev/null; then
  gcloud pubsub topics create "$PUBSUB_TOPIC" --project="$PROJECT"
  echo "  Created topic: $PUBSUB_TOPIC"
else
  echo "  Topic already exists: $PUBSUB_TOPIC"
fi

if ! gcloud pubsub subscriptions describe "$PUBSUB_SUB" --project="$PROJECT" &>/dev/null; then
  gcloud pubsub subscriptions create "$PUBSUB_SUB" \
    --topic="$PUBSUB_TOPIC" \
    --project="$PROJECT" \
    --ack-deadline=60
  echo "  Created subscription: $PUBSUB_SUB"
else
  echo "  Subscription already exists: $PUBSUB_SUB"
fi

# Grant Google Chat SA permission to publish to the topic
echo "--- Granting Chat API publish permission..."
gcloud pubsub topics add-iam-policy-binding "$PUBSUB_TOPIC" \
  --member="serviceAccount:chat-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project="$PROJECT" --quiet 2>/dev/null || true

# --- Reserve static IP ---

echo "--- Setting up static IP..."
IP_NAME="${VM_NAME}-ip"
if ! gcloud compute addresses describe "$IP_NAME" --region="$REGION" --project="$PROJECT" &>/dev/null; then
  gcloud compute addresses create "$IP_NAME" \
    --region="$REGION" \
    --project="$PROJECT"
  echo "  Reserved static IP: $IP_NAME"
else
  echo "  Static IP already exists: $IP_NAME"
fi
STATIC_IP=$(gcloud compute addresses describe "$IP_NAME" --region="$REGION" --project="$PROJECT" --format="value(address)")
echo "  IP address: $STATIC_IP"

# --- Grant VM service account permissions ---

echo "--- Setting up IAM permissions..."
# Get the default compute service account
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# VM needs Pub/Sub subscriber (to pull messages)
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/pubsub.subscriber" \
  --quiet 2>/dev/null || true

# VM needs Chat API access (to push responses back)
# Note: chat.bot scope is requested at VM level; the SA also needs
# roles/chat.app or the Chat API enabled. We enable the API above.

echo "  Granted pubsub.subscriber to $COMPUTE_SA"

# --- Create the VM ---

echo "--- Creating VM..."
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" &>/dev/null; then
  echo "  VM already exists. Updating startup script and resetting..."
  gcloud compute instances add-metadata "$VM_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --metadata="gemini-api-key=${GEMINI_API_KEY},git-branch=${GIT_BRANCH},gcp-project=${PROJECT},pubsub-subscription=${PUBSUB_SUB}" \
    --metadata-from-file="startup-script=${STARTUP_SCRIPT}"
  gcloud compute instances reset "$VM_NAME" --zone="$ZONE" --project="$PROJECT"
else
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=20GB \
    --address="$IP_NAME" \
    --scopes=cloud-platform \
    --metadata="gemini-api-key=${GEMINI_API_KEY},git-branch=${GIT_BRANCH},gcp-project=${PROJECT},pubsub-subscription=${PUBSUB_SUB}" \
    --metadata-from-file="startup-script=${STARTUP_SCRIPT}"
  echo "  Created VM: $VM_NAME"
fi

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "The VM is building now (~5 minutes for first boot, ~1 minute for subsequent boots)."
echo ""
echo "Monitor progress:"
echo "  gcloud compute instances get-serial-port-output $VM_NAME --zone=$ZONE --project=$PROJECT | tail -20"
echo ""
echo "=== Google Chat App Setup ==="
echo ""
echo "1. Go to: https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat"
echo "   (or search 'Google Chat API' in the GCP console)"
echo ""
echo "2. Click 'Configuration' tab and set:"
echo "   - App name: Forever Agent (or your preferred name)"
echo "   - Avatar URL: (optional)"
echo "   - Description: Gemini CLI forever agent"
echo "   - Functionality: check 'Spaces and group conversations' + 'Direct messages'"
echo "   - Connection settings: Cloud Pub/Sub"
echo "   - Topic name: projects/${PROJECT}/topics/${PUBSUB_TOPIC}"
echo "   - Visibility: your domain or specific users"
echo ""
echo "3. Save and add the bot to a Google Chat space or DM it directly."
echo ""
echo "Resources created:"
echo "  VM:           $VM_NAME ($ZONE) — $STATIC_IP"
echo "  Static IP:    $IP_NAME ($REGION)"
echo "  Pub/Sub:      $PUBSUB_TOPIC / $PUBSUB_SUB"
echo ""
echo "To tear down: ./scripts/teardown-forever-agent.sh"
