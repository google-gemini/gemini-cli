#!/bin/bash
#
# update_deployment.sh
# Automates updating the entire Cloud Run Job and Cloud Workflow deployment pipeline
# after local changes have been made in cloudrun/code_generator.
#
# Usage:
#   ./update_deployment.sh [PROJECT_ID] [REGION]
#
# Example:
#   ./update_deployment.sh gcli-intern-project-2026 us-central1

set -e

# Configuration defaults
PROJECT_ID=${1:-"gcli-intern-project-2026"}
REGION=${2:-"us-central1"}

IMAGE_NAME="us-central1-docker.pkg.dev/${PROJECT_ID}/pr-gen-repo/jetski-worker:latest"
JOB_NAME="pr-gen-job"
WORKFLOW_NAME="pr-gen-workflow"
WORKFLOW_SA="triaged-issue-ingestion@${PROJECT_ID}.iam.gserviceaccount.com"
EXEC_SA="code-gen-job-execution-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Ensure script runs from the directory containing Dockerfile & workflow/worker.py
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "=========================================================="
echo "Starting Deployment Pipeline Update"
echo "Project:   ${PROJECT_ID}"
echo "Region:    ${REGION}"
echo "Directory: ${SCRIPT_DIR}"
echo "=========================================================="

# 1. Build and push the updated Docker container image using Cloud Build
echo ""
echo "[1/3] Submitting Cloud Build for container image (${IMAGE_NAME})..."
BUILD_ID=$(gcloud builds submit \
  --tag "${IMAGE_NAME}" \
  --project="${PROJECT_ID}" \
  --async \
  --format="value(ID)")

echo "Build started with ID: ${BUILD_ID}. Waiting for completion..."

STATUS="WORKING"
while [ "${STATUS}" = "WORKING" ] || [ "${STATUS}" = "QUEUED" ] || [ "${STATUS}" = "PENDING" ]; do
  sleep 5
  STATUS=$(gcloud builds describe "${BUILD_ID}" --project="${PROJECT_ID}" --format="value(status)")
  echo "  Build status: ${STATUS}"
done

if [ "${STATUS}" != "SUCCESS" ]; then
  echo "Error: Cloud Build ${BUILD_ID} failed with status: ${STATUS}" >&2
  exit 1
fi
echo "Cloud Build completed successfully."

# 2. Deploy or update the Cloud Run Job template with the new container image (using 8Gi RAM to prevent OOM)
echo ""
echo "[2/3] Deploying Cloud Run Job (${JOB_NAME})..."
gcloud run jobs deploy "${JOB_NAME}" \
  --image="${IMAGE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --memory=8Gi \
  --cpu=2 \
  --task-timeout=3600 \
  --max-retries=2 \
  --service-account="${EXEC_SA}" \
  --set-env-vars="GOOGLE_CLOUD_LOCATION=global,MODEL_NAME=gemini-3.5-flash,FIRESTORE_DATABASE=test-gcli-db-clone,FIRESTORE_COLLECTION=test_issues" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,GIT_TOKEN=PR_GEN_GITHUB_PUSH_KEY:latest" \
  --quiet

# 3. Deploy the latest local Cloud Workflow definition (workflow.yaml)
echo ""
echo "[3/3] Deploying Cloud Workflow definition (${WORKFLOW_NAME})..."
gcloud workflows deploy "${WORKFLOW_NAME}" \
  --source="workflow.yaml" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --service-account="${WORKFLOW_SA}" \
  --quiet

echo ""
echo "=========================================================="
echo "Deployment pipeline updated successfully!"
echo "=========================================================="
echo ""
echo "To execute a test workflow run, you can run:"
echo "  npm start ${PROJECT_ID}"
echo ""
