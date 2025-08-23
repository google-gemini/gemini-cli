/**
 * Helpers for secure sandbox handling: tokenization, env parsing, safe spawn.
 *
 * These helpers are deliberately conservative:
 *  - do NOT execute strings via a shell
 *  - validate SANDBOX_ENV key/value pairs
 *  - strip dangerous environment variables
 */
import { spawn, ChildProcess } from 'node:child_process';

// Dangerous env vars we should never propagate
const DANGEROUS_ENVS = new Set([
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'BASH_ENV',
  'ENV',
  'IFS',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'JAVA_TOOL_OPTIONS',
]);

// Sensitive environment variables that should be filtered for security
const SENSITIVE_ENVS = new Set([
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AZURE_CLIENT_SECRET',
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
  'SLACK_TOKEN',
  'DISCORD_TOKEN',
  'PASSWORD',
  'SECRET',
  'TOKEN',
  'KEY',
  'CREDENTIALS',
]);

// Allowed SANDBOX_MOUNTS paths (restrictive allowlist)
const ALLOWED_MOUNT_PATHS = new Set([
  '/usr/bin',
  '/usr/local/bin',
  '/bin',
  '/usr/lib',
  '/lib',
  '/etc/ld.so.cache',
  '/proc/meminfo',
  '/proc/cpuinfo',
  '/dev/null',
  '/dev/zero',
  '/dev/urandom',
  '/tmp',
  '/var/tmp',
]);

/** Minimal tokeniser for a command line preserving quoted tokens.
 *  This is intentionally small and conservative.
 */
export function parseCommandString(raw: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (cur.length) {
        tokens.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur.length) tokens.push(cur);
  return tokens;
}

export function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

export function isSafeEnvValue(val: string): boolean {
  // disallow control chars and shell metacharacters
  if (val === undefined || val === null) return true;
  if (typeof val !== 'string') return false;
  if (/[\r\n]/.test(val)) return false;
  // disallow `;|&$<>` and backticks and newlines
  if (/[;&|`$<>()]/.test(val)) return false;
  return true;
}

/** Parse SANDBOX_ENV as comma-separated KEY=VAL pairs and filter invalid ones. */
export function parseAndFilterSandboxEnv(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const parts = raw.split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!isValidEnvKey(key) || DANGEROUS_ENVS.has(key)) continue;
    if (!isSafeEnvValue(value)) continue;
    if (value.length === 0) continue; // skip empty values

    // Additional security: filter sensitive environment variables
    if (SENSITIVE_ENVS.has(key.toUpperCase())) {
      console.warn(`SECURITY: Filtering sensitive environment variable: ${key}`);
      continue;
    }

    out[key] = value;
  }
  return out;
}

/** Validate SANDBOX_MOUNTS to prevent arbitrary host path exposure */
export function validateSandboxMounts(raw?: string): string[] {
  const validMounts: string[] = [];
  if (!raw) return validMounts;

  const mounts = raw.split(',').map(m => m.trim()).filter(m => m.length > 0);

  for (const mount of mounts) {
    // Parse mount specification (from:to:options)
    const parts = mount.split(':');
    const fromPath = parts[0]?.trim();

    if (!fromPath) continue;

    // Normalize path for comparison
    const normalizedPath = fromPath.replace(/\\/g, '/');

    // Check against allowlist
    if (!ALLOWED_MOUNT_PATHS.has(normalizedPath)) {
      console.warn(`SECURITY: Blocking unauthorized mount path: ${fromPath}`);
      continue;
    }

    validMounts.push(mount);
  }

  return validMounts;
}

/** Build a sanitized environment to pass to spawned child processes. */
export function buildSafeEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};

  // Minimal PATH fallback - prefer parent's PATH if set, otherwise sane default
  safe['PATH'] = parent['PATH'] || '/usr/bin:/bin';
  if (parent['LANG']) safe['LANG'] = parent['LANG'];
  if (parent['HOME']) safe['HOME'] = parent['HOME'];

  // Add additional safe variables that are strictly whitelisted (extend as needed)
  const whitelist = ['TERM', 'USER', 'LOGNAME']; // minimal
  for (const k of whitelist) {
    if (k in parent && typeof parent[k] === 'string') safe[k] = parent[k]!;
  }

  // Filter out sensitive environment variables that could expose credentials
  for (const key of Object.keys(parent)) {
    if (SENSITIVE_ENVS.has(key.toUpperCase())) {
      console.warn(`SECURITY: Filtering sensitive environment variable: ${key}`);
      continue;
    }

    // Also check for sensitive patterns in key names
    if (key.toUpperCase().includes('PASSWORD') ||
        key.toUpperCase().includes('SECRET') ||
        key.toUpperCase().includes('TOKEN') ||
        key.toUpperCase().includes('KEY') ||
        key.toUpperCase().includes('CREDENTIAL')) {
      console.warn(`SECURITY: Filtering potentially sensitive environment variable: ${key}`);
      continue;
    }

    // Only pass through whitelisted or safe environment variables
    if (whitelist.includes(key) ||
        key.startsWith('LC_') ||
        key === 'PATH' ||
        key === 'LANG' ||
        key === 'HOME' ||
        key === 'TERM' ||
        key === 'SHELL' ||
        key === 'USER' ||
        key === 'LOGNAME') {
      safe[key] = parent[key]!;
    }
  }

  // Add sanitized SANDBOX_ENV entries (this function already filters sensitive vars)
  const extra = parseAndFilterSandboxEnv(parent['SANDBOX_ENV']);
  for (const k of Object.keys(extra)) safe[k] = extra[k];

  return safe;
}

/** Helper to validate a JSON array-of-strings command form */
function isStringArray(a: unknown): a is string[] {
  return Array.isArray(a) && a.every((x) => typeof x === 'string');
}

/** Safely spawn a proxy command configured via GEMINI_SANDBOX_PROXY_COMMAND
 *  Supported forms:
 *    - JSON array (recommended): '["/usr/bin/socat", "arg1", "arg2"]'
 *    - Plain tokenizable string: '/usr/bin/socat "arg with space" -'
 *
 *  Returns the spawned child process or undefined if nothing to run.
 */
export function safeSpawnProxy(): ChildProcess | undefined {
  const raw = process.env['GEMINI_SANDBOX_PROXY_COMMAND'];
  if (!raw) return undefined;

  let tokens: string[] | undefined;

  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isStringArray(parsed) && parsed.length > 0) tokens = parsed;
    } catch {
      // fall through to plain parse
    }
  }

  if (!tokens) {
    tokens = parseCommandString(trimmed);
  }

  if (!tokens || tokens.length === 0) return undefined;

  const cmd = tokens[0];
  const args = tokens.slice(1);

  // Build safe env, explicit pruning of dangerous variables
  const safeEnv = buildSafeEnv(process.env);
  for (const d of Array.from(DANGEROUS_ENVS)) {
    if (d in safeEnv) delete safeEnv[d];
  }

  // Additional security: validate SANDBOX_MOUNTS
  const sandboxMounts = process.env['SANDBOX_MOUNTS'];
  if (sandboxMounts) {
    const validMounts = validateSandboxMounts(sandboxMounts);
    if (validMounts.length !== sandboxMounts.split(',').length) {
      console.warn('SECURITY: Some SANDBOX_MOUNTS were filtered for security');
    }
  }

  // Spawn without a shell so metacharacters are not interpreted
  // Use 'pipe' stdio so tests/integration can observe output
  const cp = spawn(cmd, args, { stdio: 'pipe', shell: false, env: safeEnv });
  cp.on('error', (err) => {
    // this module is a helper; avoid throwing synchronously
    // consumer should handle errors/logging as appropriate
    // eslint-disable-next-line no-console
    console.error('safeSpawnProxy error:', err);
  });
  return cp;
}

export default {
  parseCommandString,
  parseAndFilterSandboxEnv,
  buildSafeEnv,
  safeSpawnProxy,
  validateSandboxMounts,
};
