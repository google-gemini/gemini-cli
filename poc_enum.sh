#!/usr/bin/env bash
set -euo pipefail

echo "===== RUNNER IDENTITY ====="
echo "hostname: $(hostname)"
echo "user: $(id)"
echo "uname: $(uname -a)"
echo "runner_name: ${RUNNER_NAME:-unset}"
echo "runner_os: ${RUNNER_OS:-unset}"

echo "===== GCP METADATA ====="
META="http://169.254.169.254/computeMetadata/v1"
H="Metadata-Flavor: Google"
curl -sf -H "$H" "$META/project/project-id"          && echo " (project-id)"   || echo "no metadata"
curl -sf -H "$H" "$META/instance/zone"                && echo " (zone)"          || true
curl -sf -H "$H" "$META/instance/machine-type"        && echo " (machine-type)"  || true
curl -sf -H "$H" "$META/instance/service-accounts/"  && echo " (sa-list)"       || true
curl -sf -H "$H" "$META/instance/service-accounts/default/email" && echo " (sa-email)" || true
curl -sf -H "$H" "$META/instance/service-accounts/default/scopes" && echo " (sa-scopes)" || true

echo "===== NETWORK ====="
ip addr 2>/dev/null || ifconfig
ip route 2>/dev/null || netstat -rn
cat /etc/resolv.conf

echo "===== SECRET PRESENCE ====="
echo "GEMINI_API_KEY set: $([ -n "${GEMINI_API_KEY:-}" ] && echo YES || echo NO)"
echo "GEMINI_CLI_ROBOT_GITHUB_PAT set: $([ -n "${GEMINI_CLI_ROBOT_GITHUB_PAT:-}" ] && echo YES || echo NO)"

echo "===== ENVIRONMENT (redacted) ====="
env | sort | grep -Ev "KEY|PAT|TOKEN|SECRET|PASSWORD|CREDENTIAL" || true

echo "===== FILESYSTEM / MOUNTS ====="
df -h
mount | head -30

echo "===== PROCESSES ====="
ps aux | head -30
