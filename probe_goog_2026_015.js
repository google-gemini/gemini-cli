// GOOG-2026-015 — Inert security probe
// Google OSS-VRP authorized research
// Contact: manhluat93.php@gmail.com
//
// This file logs workflow context to verify that fork PR code
// executes in the default-branch workflow_run context with cache access.
// No secrets are exfiltrated — only existence checks and public metadata.

const fs = require('fs');
const path = require('path');

const marker = [
  '=== GOOG-2026-015-INERT-PROBE ===',
  `timestamp=${new Date().toISOString()}`,
  `GITHUB_ACTIONS=${!!process.env.GITHUB_ACTIONS}`,
  `GITHUB_EVENT_NAME=${process.env.GITHUB_EVENT_NAME || 'n/a'}`,
  `GITHUB_REF=${process.env.GITHUB_REF || 'n/a'}`,
  `GITHUB_REPOSITORY=${process.env.GITHUB_REPOSITORY || 'n/a'}`,
  `GITHUB_WORKFLOW=${process.env.GITHUB_WORKFLOW || 'n/a'}`,
  `GITHUB_RUN_ID=${process.env.GITHUB_RUN_ID || 'n/a'}`,
  `GITHUB_TOKEN_EXISTS=${!!process.env.GITHUB_TOKEN}`,
  `NODE_AUTH_TOKEN_EXISTS=${!!process.env.NODE_AUTH_TOKEN}`,
  `NPM_TOKEN_EXISTS=${!!process.env.NPM_TOKEN}`,
  `ACTIONS_CACHE_URL_EXISTS=${!!process.env.ACTIONS_CACHE_URL}`,
  `ACTIONS_RUNTIME_TOKEN_EXISTS=${!!process.env.ACTIONS_RUNTIME_TOKEN}`,
  `npm_config_cache=${process.env.npm_config_cache || 'n/a'}`,
  '=== END-PROBE ==='
].join('\n');

console.log(marker);

// Also write to a file in case stdout is truncated
try {
  fs.writeFileSync('/tmp/goog-2026-015-probe.txt', marker);
} catch(e) {
  // Ignore write errors on non-Linux
}
