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
  if (/[;&|`$<>]/.test(val)) return false;
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
    if (!isValidEnvKey(key)) continue;
    if (!isSafeEnvValue(value)) continue;
    if (value.length === 0) continue; // skip empty values
    out[key] = value;
  }
  return out;
}

/** Build a sanitized environment to pass to spawned child processes. */
export function buildSafeEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};

  // Minimal PATH fallback - prefer parent's PATH if set, otherwise sane default
  safe.PATH = parent.PATH || '/usr/bin:/bin';
  if (parent.LANG) safe.LANG = parent.LANG;
  if (parent.HOME) safe.HOME = parent.HOME;

  // Add additional safe variables that are strictly whitelisted (extend as needed)
  const whitelist = ['TERM', 'USER', 'LOGNAME']; // minimal
  for (const k of whitelist) {
    if (k in parent && typeof parent[k] === 'string') safe[k] = parent[k]!;
  }

  // Add sanitized SANDBOX_ENV entries
  const extra = parseAndFilterSandboxEnv(parent.SANDBOX_ENV);
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
  const raw = process.env.GEMINI_SANDBOX_PROXY_COMMAND;
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
  for (const d of DANGEROUS_ENVS) {
    if (d in safeEnv) delete safeEnv[d];
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
};
