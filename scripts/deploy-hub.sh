#!/bin/bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "Error: No GCP project configured. Run 'gcloud config set project [PROJECT_ID]'"
    exit 1
fi

REGION="us-west1"
REPO_NAME="workspaces"
IMAGE_NAME="workspace-hub"
SERVICE_NAME="workspace-hub"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME"

echo "Using Project: $PROJECT_ID"

# 0. Ensure Artifact Registry exists
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" &>/dev/null; then
    echo "Creating Artifact Registry repository: $REPO_NAME"
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="Gemini CLI Workspaces Repository"
fi

# 1. Build and Push the Hub Image
echo "Building and pushing $IMAGE_NAME to Artifact Registry..."
gcloud builds submit --tag "$IMAGE_URI" packages/workspace-manager/

# 2. Deploy to Cloud Run
echo "Deploying $SERVICE_NAME to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --platform managed \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --service-account "workspace-hub-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"

echo "Deployment complete!"
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)'
