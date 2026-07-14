#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Use the provided project ID or default to the one in your .env
PROJECT_ID=${1:-"gcli-intern-project-2026"}
SA_NAME="test-workflow-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=========================================================="
echo "Configuring permissions for: ${SA_EMAIL}"
echo "Target Project: ${PROJECT_ID}"
echo "=========================================================="

# List of roles required for both Workflow execution and Eventarc triggering
ROLES=(
  "roles/logging.logWriter"          # Allowed to write logs (Workflow Runner)
  "roles/workflows.invoker"         # Allowed to start/invoke workflows (Eventarc Trigger)
  "roles/monitoring.metricWriter"   # Allowed to write metrics (Eventarc Trigger)
  "roles/run.developer"             # Allowed to execute Cloud Run Jobs
)

for ROLE in "${ROLES[@]}"; do
  echo "Granting role: ${ROLE}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet
done

# Create the dedicated Cloud Run Job Execution Service Account
EXEC_SA_NAME="code-gen-job-execution-sa"
EXEC_SA_EMAIL="${EXEC_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Check if execution SA already exists
if ! gcloud iam service-accounts describe "${EXEC_SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating execution service account: ${EXEC_SA_NAME}..."
  gcloud iam service-accounts create "${EXEC_SA_NAME}" \
    --description="Service account for executing jetski-worker Cloud Run jobs" \
    --display-name="Jetski Job Runner" \
    --project="${PROJECT_ID}" \
    --quiet
else
  echo "Execution service account ${EXEC_SA_NAME} already exists."
fi

# Grant roles to the new execution SA
EXEC_SA_ROLES=(
  "roles/aiplatform.user"
  "roles/logging.logWriter"
  "roles/storage.objectViewer"
  "roles/developerconnect.readTokenAccessor"
  "roles/cloudaicompanion.user"       # Required for Gemini/Antigravity SDK companion tools
)

for ROLE in "${EXEC_SA_ROLES[@]}"; do
  echo "Granting role: ${ROLE} to ${EXEC_SA_EMAIL}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${EXEC_SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet
done

# Grant access to the specific Secret Manager secret used by Cloud Workflow (NOT the Job)
echo "Granting secretAccessor on test-github-push-key to ${SA_EMAIL}..."
gcloud secrets add-iam-policy-binding test-github-push-key \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}" \
  --quiet

# Explicitly revoke secretAccessor on test-github-push-key from ${EXEC_SA_EMAIL} to enforce isolation
echo "Ensuring ${EXEC_SA_EMAIL} does NOT have secretAccessor on test-github-push-key..."
gcloud secrets remove-iam-policy-binding test-github-push-key \
  --member="serviceAccount:${EXEC_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}" \
  --quiet || true

# Grant access to the GEMINI_API_KEY secret used by Cloud Run Job
echo "Granting secretAccessor on GEMINI_API_KEY to ${EXEC_SA_EMAIL}..."
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${EXEC_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}" \
  --quiet

# Grant workflow SA the serviceAccountUser role on the new execution SA so it can run jobs as the new SA
echo "Granting iam.serviceAccountUser on ${EXEC_SA_EMAIL} to ${SA_EMAIL}..."
gcloud iam service-accounts add-iam-policy-binding "${EXEC_SA_EMAIL}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" \
  --project="${PROJECT_ID}" \
  --quiet

# Get Project Number to construct default Compute SA email (for Cloud Build operations)
echo "Fetching project number..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant permissions to default Compute SA (used by Cloud Build) to read source and push images
COMPUTE_SA_ROLES=(
  "roles/storage.objectViewer"
  "roles/logging.logWriter"
  "roles/artifactregistry.writer"
)

for ROLE in "${COMPUTE_SA_ROLES[@]}"; do
  echo "Granting role: ${ROLE} to ${COMPUTE_SA}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="${ROLE}" \
    --quiet
done


echo "=========================================================="
echo "Success! All permissions have been configured."
echo "=========================================================="
