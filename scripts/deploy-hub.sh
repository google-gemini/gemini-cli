#!/bin/bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-west1"
IMAGE_NAME="workspace-hub"
SERVICE_NAME="workspace-hub"

echo "Using Project: $PROJECT_ID"

# 1. Build and Push the Hub Image
# (Assuming the Dockerfile is in the current package for the hub)
echo "Building and pushing $IMAGE_NAME..."
gcloud builds submit --tag "gcr.io/$PROJECT_ID/$IMAGE_NAME" packages/workspace-manager/

# 2. Deploy to Cloud Run
echo "Deploying $SERVICE_NAME to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "gcr.io/$PROJECT_ID/$IMAGE_NAME" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"

echo "Deployment complete!"
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)'
