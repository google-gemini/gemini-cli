#!/usr/bin/env bash
# Caretaker Agent GCP Deployment Script
set -euo pipefail

if [ -z "${PROJECT_ID:-}" ]; then
    echo "Error: PROJECT_ID environment variable is required." >&2
    echo "Please export PROJECT_ID before running this script:" >&2
    echo "  export PROJECT_ID=\"your-gcp-project-id\"" >&2
    exit 1
fi
REGION="us-west1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================="
echo " 🚀 Deploying Caretaker Agent Services to GCP"
echo " Project ID: ${PROJECT_ID}"
echo " Region:     ${REGION}"
echo " Build Logs: https://pantheon.corp.google.com/cloud-build/builds?project=${PROJECT_ID}"
echo "=================================================="

# 1. Deploy Ingestion Cloud Run Service
echo ""
echo "--> 1/3 Deploying Ingestion Service..."
gcloud run deploy ingestion-service \
    --source "${ROOT_DIR}/cloudrun/ingestion-service" \
    --service-account "ingestion-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --min-instances 0 \
    --max-instances 10 \
    --no-allow-unauthenticated \
    --region "${REGION}" \
    --project "${PROJECT_ID}"

# 2. Deploy Triage Worker Cloud Run Job
echo ""
echo "--> 2/3 Deploying Triage Worker Job..."
gcloud run jobs deploy triage-worker \
    --source "${ROOT_DIR}/cloudrun/triage-worker" \
    --service-account "triage-worker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --memory 1Gi \
    --cpu 1 \
    --task-timeout 20m \
    --tasks 1 \
    --max-retries 0 \
    --region "${REGION}" \
    --project "${PROJECT_ID}"

# 3. Deploy Egress Cloud Run Service
echo ""
echo "--> 3/3 Deploying Egress Service..."
gcloud run deploy egress-service \
    --source "${ROOT_DIR}/cloudrun/egress-service" \
    --service-account "egress-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --no-allow-unauthenticated \
    --region "${REGION}" \
    --project "${PROJECT_ID}"

echo ""
echo "=================================================="
echo " ✅ All Caretaker Agent services successfully deployed!"
echo "=================================================="
