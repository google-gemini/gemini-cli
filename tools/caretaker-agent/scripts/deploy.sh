#!/usr/bin/env bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Caretaker Agent & PR Generator GCP Deployment Script
# Production-grade entrypoint script for deploying all Caretaker Agent GCP services, jobs, and workflows.
#
# Usage:
#   ./deploy.sh [--project-id ID] [--region REGION] [--tag TAG] [--target TARGET] [--dry-run] [--skip-build]
#
# Supported Targets:
#   ingestion   - Ingestion Cloud Run Service (cloudrun/ingestion-service)
#   triage      - Triage Worker Cloud Run Job (cloudrun/triage-worker)
#   egress      - Egress Cloud Run Service (cloudrun/egress-service)
#   evals       - Triage Eval Runner Cloud Run Job (evals/triage)
#   pr-gen      - PR Generator Pipeline (Cloud Build + Cloud Run Job + Cloud Workflow)
#   all         - Deploys all Caretaker Agent and PR Generator components (default)

set -euo pipefail

# Configuration defaults
PROJECT_ID="${PROJECT_ID:-gcli-intern-project-2026}"
REGION="${REGION:-us-central1}"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")
TAG="${TAG:-${GIT_SHA}}"
TARGET="all"
DRY_RUN=false
SKIP_BUILD=false

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--project-id) PROJECT_ID="$2"; shift 2 ;;
    -r|--region)     REGION="$2"; shift 2 ;;
    -t|--tag)        TAG="$2"; shift 2 ;;
    --target)        TARGET="$2"; shift 2 ;;
    --dry-run)       DRY_RUN=true; shift ;;
    --skip-build)    SKIP_BUILD=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--project-id ID] [--region REGION] [--tag TAG] [--target TARGET] [--dry-run] [--skip-build]"
      echo ""
      echo "Supported Targets:"
      echo "  ingestion   - Ingestion Cloud Run Service"
      echo "  triage      - Triage Worker Cloud Run Job"
      echo "  egress      - Egress Cloud Run Service"
      echo "  evals       - Triage Eval Runner Cloud Run Job"
      echo "  pr-gen      - PR Generator Pipeline (Cloud Build + Cloud Run Job + Cloud Workflow)"
      echo "  all         - Deploys all components (default)"
      exit 0
      ;;
    *)
      # Fallback for positional arguments or legacy target syntax (e.g. ./deploy.sh pr-gen)
      if [[ "$1" =~ ^(ingestion|triage|egress|evals|pr-gen|all)$ ]]; then
        TARGET="$1"
        shift
      else
        echo "Error: Unknown argument: $1" >&2
        exit 1
      fi
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -z "${PROJECT_ID:-}" ]; then
    echo "Error: PROJECT_ID environment variable or --project-id flag is required." >&2
    exit 1
fi

echo "=========================================================="
echo " 🚀 Caretaker Agent & PR Generator GCP Deployment Pipeline"
echo " Project ID: ${PROJECT_ID}"
echo " Region:     ${REGION}"
echo " Image Tag:  ${TAG}"
echo " Target:     ${TARGET}"
echo " Dry Run:    ${DRY_RUN}"
echo " Build Logs: https://console.cloud.google.com/cloud-build/builds?project=${PROJECT_ID}"
echo "=========================================================="

run_cmd() {
    if [ "${DRY_RUN}" = true ]; then
        echo "[DRY-RUN] $*"
    else
        "$@"
    fi
}

# Helper to check target matching
should_deploy() {
    local target_name="$1"
    if [[ "${TARGET}" == "all" ]] || [[ "${TARGET}" == "${target_name}" ]]; then
        return 0
    else
        return 1
    fi
}

# 1. Deploy Ingestion Cloud Run Service
if should_deploy "ingestion"; then
    echo ""
    echo "--> [1/5] Deploying Ingestion Service (ingestion-service)..."
    run_cmd gcloud run deploy ingestion-service \
        --source "${ROOT_DIR}/cloudrun/ingestion-service" \
        --service-account "ingestion-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --min-instances 0 \
        --max-instances 10 \
        --no-allow-unauthenticated \
        --region "${REGION}" \
        --project "${PROJECT_ID}" \
        --quiet
fi

# 2. Deploy Triage Worker Cloud Run Job
if should_deploy "triage"; then
    echo ""
    echo "--> [2/5] Deploying Triage Worker Job (triage-worker)..."
    run_cmd gcloud run jobs deploy triage-worker \
        --source "${ROOT_DIR}/cloudrun/triage-worker" \
        --service-account "triage-worker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --network "default" \
        --subnet "default" \
        --vpc-egress "all-traffic" \
        --memory 1Gi \
        --cpu 1 \
        --task-timeout 20m \
        --tasks 1 \
        --max-retries 0 \
        --region "${REGION}" \
        --project "${PROJECT_ID}" \
        --quiet
fi

# 3. Deploy Egress Cloud Run Service
if should_deploy "egress"; then
    echo ""
    echo "--> [3/5] Deploying Egress Service (egress-service)..."
    run_cmd gcloud run deploy egress-service \
        --source "${ROOT_DIR}/cloudrun/egress-service" \
        --service-account "egress-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --no-allow-unauthenticated \
        --region "${REGION}" \
        --project "${PROJECT_ID}" \
        --quiet
fi

# 4. Deploy Triage Eval Runner Cloud Run Job
if should_deploy "evals"; then
    echo ""
    echo "--> [4/5] Deploying Triage Eval Runner Job (eval-runner)..."
    run_cmd gcloud run jobs deploy eval-runner \
        --source "${ROOT_DIR}" \
        --service-account "triage-eval-runner-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --memory 2Gi \
        --cpu 1 \
        --tasks 1 \
        --task-timeout 1h \
        --max-retries 0 \
        --region "${REGION}" \
        --project "${PROJECT_ID}" \
        --quiet
fi

# 5. Deploy PR Generator Pipeline (Cloud Build + Cloud Run Job + Cloud Workflow)
if should_deploy "pr-gen"; then
    echo ""
    echo "--> [5/5] Deploying PR Generator Pipeline (pr-gen)..."
    
    IMAGE_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/pr-gen-repo/jetski-worker"
    IMAGE_NAME="${IMAGE_REPO}:${TAG}"
    LATEST_NAME="${IMAGE_REPO}:latest"
    JOB_NAME="pr-gen-job"
    WORKFLOW_NAME="pr-gen-workflow"
    WORKFLOW_SA="triaged-issue-ingestion@${PROJECT_ID}.iam.gserviceaccount.com"
    EXEC_SA="code-gen-job-execution-sa@${PROJECT_ID}.iam.gserviceaccount.com"
    PR_GEN_DIR="${ROOT_DIR}/cloudrun/pr-generator"

    if [ "${SKIP_BUILD}" = false ]; then
        echo "  [5.1] Submitting Cloud Build for container image: ${IMAGE_NAME}"
        if [ "${DRY_RUN}" = true ]; then
            echo "[DRY-RUN] gcloud builds submit --tag ${IMAGE_NAME} --project=${PROJECT_ID} --async ${PR_GEN_DIR}"
            echo "[DRY-RUN] gcloud container images add-tag ${IMAGE_NAME} ${LATEST_NAME} --quiet"
        else
            BUILD_ID=$(gcloud builds submit "${PR_GEN_DIR}" \
              --tag "${IMAGE_NAME}" \
              --project="${PROJECT_ID}" \
              --async \
              --format="value(ID)")

            echo "  Cloud Build started with ID: ${BUILD_ID}. Waiting for build completion..."
            STATUS="WORKING"
            while [[ "${STATUS}" == "WORKING" || "${STATUS}" == "QUEUED" || "${STATUS}" == "PENDING" ]]; do
              sleep 5
              STATUS=$(gcloud builds describe "${BUILD_ID}" --project="${PROJECT_ID}" --format="value(status)")
              echo "    Build status: ${STATUS}"
            done

            if [[ "${STATUS}" != "SUCCESS" ]]; then
              echo "Error: Cloud Build ${BUILD_ID} failed with status: ${STATUS}" >&2
              exit 1
            fi
            echo "  Cloud Build completed successfully."
            gcloud container images add-tag "${IMAGE_NAME}" "${LATEST_NAME}" --quiet || true
        fi
    else
        echo "  [5.1] Skipping container image build (--skip-build set)."
    fi

    echo "  [5.2] Deploying Cloud Run Job: ${JOB_NAME}"
    run_cmd gcloud run jobs deploy "${JOB_NAME}" \
      --image="${IMAGE_NAME}" \
      --region="${REGION}" \
      --project="${PROJECT_ID}" \
      --memory=16Gi \
      --cpu=4 \
      --task-timeout=5400 \
      --max-retries=2 \
      --service-account="${EXEC_SA}" \
      --set-env-vars="GOOGLE_CLOUD_LOCATION=global,MODEL_NAME=gemini-3.5-flash,FIRESTORE_DATABASE=gcli-db,FIRESTORE_COLLECTION=issues,PR_GEN_DEBUG_LOGS_BUCKET=pr_generation_debug_logs" \
      --set-secrets="GIT_TOKEN=PR_GEN_GITHUB_PUSH_KEY:latest" \
      --quiet

    echo "  [5.3] Deploying Cloud Workflow: ${WORKFLOW_NAME}"
    run_cmd gcloud workflows deploy "${WORKFLOW_NAME}" \
      --source="${ROOT_DIR}/workflows/pr-generation-workflow.yaml" \
      --location="${REGION}" \
      --project="${PROJECT_ID}" \
      --service-account="${WORKFLOW_SA}" \
      --set-env-vars="FIRESTORE_DATABASE=gcli-db,FIRESTORE_COLLECTION=issues" \
      --quiet
fi

echo ""
echo "=========================================================="
echo " ✅ Caretaker Agent GCP Deployment completed successfully!"
echo "=========================================================="
