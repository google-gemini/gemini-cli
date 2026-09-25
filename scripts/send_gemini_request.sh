#!/bin/bash
# -----------------------------------------------------------------------------
# Gemini API Replay Script
# -----------------------------------------------------------------------------
# Purpose:
#   This script is used to replay a Gemini API request using a raw JSON payload.
#   It is particularly useful for debugging the exact requests made by the
#   Gemini CLI.
#
# Prerequisites:
#   1. Export your Gemini API key:
#      export GEMINI_API_KEY="your_api_key_here"
#
#   2. Generate a request payload from the Gemini CLI:
#      Inside the CLI, run the `/chat debug` command. This will save the most
#      recent API request to a file named `gcli-request-<timestamp>.json`.
#
# Usage:
#   ./scripts/send_gemini_request.sh --payload <path_to_json> --model <model_id> [--stream]
#
# Options:
#   --payload <file>  Path to the JSON request payload.
#   --model <id>      The Gemini model ID (e.g., gemini-3-flash-preview).
#   --stream          (Optional) Use the streaming API endpoint. Defaults to non-streaming.
#
# Example:
#   ./scripts/send_gemini_request.sh --payload gcli-request.json --model gemini-3-flash-preview
# -----------------------------------------------------------------------------

set -e -E

# Load environment variables from .env if it exists
if [[ -f ".env" ]]; then
    echo "Loading environment variables from .env file..."
    set -a # Automatically export all variables
    # shellcheck source=/dev/null
    source .env
    set +a
fi

# Function to print usage
usage() {
    echo "Usage: $0 --payload <path_to_json_file> --model <model_id> [--stream]"
    echo "Ensure GEMINI_API_KEY environment variable is set."
    exit 1
}

STREAM_MODE=false

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --payload) PAYLOAD_FILE="${2}"; shift ;;
        --model) MODEL_ID="${2}"; shift ;;
        --stream) STREAM_MODE=true ;;
        *) echo "Unknown parameter passed: ${1}"; usage ;;
    esac
    shift
done

# Validate inputs
if [[ -z "${PAYLOAD_FILE}" ]] || [[ -z "${MODEL_ID}" ]]; then
    echo "Error: Missing required arguments."
    usage
fi

if [[ -z "${GEMINI_API_KEY}" ]]; then
    echo "Error: GEMINI_API_KEY environment variable is not set."
    exit 1
fi

if [[ ! -f "${PAYLOAD_FILE}" ]]; then
    echo "Error: Payload file '${PAYLOAD_FILE}' does not exist."
    exit 1
fi

# API Endpoint definition
if [[ "${STREAM_MODE}" = true ]]; then
    GENERATE_CONTENT_API="streamGenerateContent"
    echo "Mode: Streaming"
else
    GENERATE_CONTENT_API="generateContent"
    echo "Mode: Non-streaming (Default)"
fi

echo "Sending request to model: ${MODEL_ID}"
echo "Using payload from: ${PAYLOAD_FILE}"
echo "----------------------------------------"

# Make the cURL request. If non-streaming, pipe through jq for readability if available.
if [[ "${STREAM_MODE}" = false ]] && command -v jq &> /dev/null; then
    # Invoke curl separately to avoid masking its return value
    output=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      "https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?key=${GEMINI_API_KEY}" \
      -d "@${PAYLOAD_FILE}")
    echo "${output}" | jq .
else
    curl -X POST \
      -H "Content-Type: application/json" \
      "https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?key=${GEMINI_API_KEY}" \
      -d "@${PAYLOAD_FILE}"
fi

echo -e "\n----------------------------------------"
