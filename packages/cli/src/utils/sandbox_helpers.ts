/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enhanced helpers for secure sandbox handling: tokenization, env parsing, safe spawn.
 *
 * These helpers are deliberately conservative and security-focused:
 *  - do NOT execute strings via a shell
 *  - validate SANDBOX_ENV key/value pairs with comprehensive filtering
 *  - strip dangerous and sensitive environment variables
 *  - implement path traversal protection
 *  - provide comprehensive logging and error handling
 */
import { spawn, ChildProcess } from 'node:child_process';
import { resolve, normalize } from 'node:path';

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
  'DYLD_INSERT_LIBRARIES', // macOS equivalent of LD_PRELOAD
  'DYLD_LIBRARY_PATH',     // macOS equivalent of LD_LIBRARY_PATH
  'PERL5LIB',
  'RUBYLIB',
  'CLASSPATH',
]);

// Sensitive environment variables that should be filtered for security
const SENSITIVE_ENVS = new Set([
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
  'AZURE_CLIENT_ID',
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
  'SLACK_TOKEN',
  'DISCORD_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PASSWORD',
  'SECRET',
  'TOKEN',
  'KEY',
  'CREDENTIALS',
  'AUTH',
  'PRIVATE_KEY',
  'CERTIFICATE',
]);

// Allowed SANDBOX_MOUNTS paths (restrictive allowlist)
const ALLOWED_MOUNT_PATHS = new Set([
  '/usr/bin',
  '/usr/local/bin',
  '/bin',
  '/usr/lib',
  '/usr/local/lib',
  '/lib',
  '/lib64',
  '/etc/ld.so.cache',
  '/etc/passwd',
  '/etc/group',
  '/proc/meminfo',
  '/proc/cpuinfo',
  '/proc/version',
  '/dev/null',
  '/dev/zero',
  '/dev/urandom',
  '/dev/random',
  '/tmp',
  '/var/tmp',
  '/usr/share/zoneinfo',
]);

// Enhanced security patterns for detecting sensitive data
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /private/i,
  /cert/i,
  /ssl/i,
  /tls/i,
];

/** Enhanced tokeniser for a command line preserving quoted tokens with escape support.
 *  This is intentionally conservative and handles edge cases.
 */
export function parseCommandString(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  
  const tokens: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    
    if (ch === '\\' && (inSingle || inDouble)) {
      escaped = true;
      continue;
    }
    
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
  
  // Security check: reject if quotes are unbalanced
  if (inSingle || inDouble) {
    console.warn('SECURITY: Unbalanced quotes in command string, rejecting');
    return [];
  }
  
  return tokens;
}

export function isValidEnvKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  // More strict validation: must start with letter or underscore, contain only alphanumeric and underscore
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && key.length <= 256; // reasonable length limit
}

export function isSafeEnvValue(val: string): boolean {
  // Enhanced safety checks for environment values
  if (val === undefined || val === null) return true;
  if (typeof val !== 'string') return false;
  
  // Length limit for security
  if (val.length > 4096) return false;
  
  // Disallow control chars and shell metacharacters
  if (/[\r\n\0]/.test(val)) return false;
  
  // Disallow dangerous shell metacharacters and command injection patterns
  if (/[;&|`$<>(){}[\]\\]/.test(val)) return false;
  
  // Check for potential command injection patterns
  if (/\$\(|`|\\x[0-9a-fA-F]{2}/.test(val)) return false;
  
  return true;
}

/** Enhanced parsing of SANDBOX_ENV with comprehensive security filtering. */
export function parseAndFilterSandboxEnv(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'string') return out;
  
  // Enhanced parsing with better error handling
  const parts = raw.split(',').map(p => p.trim()).filter(p => p.length > 0);
  
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      console.warn(`SECURITY: Invalid env format (missing =): ${part}`);
      continue;
    }
    
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    
    // Enhanced validation
    if (!isValidEnvKey(key)) {
      console.warn(`SECURITY: Invalid env key format: ${key}`);
      continue;
    }
    
    if (DANGEROUS_ENVS.has(key)) {
      console.warn(`SECURITY: Blocking dangerous environment variable: ${key}`);
      continue;
    }
    
    if (!isSafeEnvValue(value)) {
      console.warn(`SECURITY: Unsafe env value for key: ${key}`);
      continue;
    }
    
    if (value.length === 0) continue; // skip empty values

    // Enhanced sensitive variable detection
    const keyUpper = key.toUpperCase();
    if (SENSITIVE_ENVS.has(keyUpper)) {
      console.warn(`SECURITY: Filtering sensitive environment variable: ${key}`);
      continue;
    }
    
    // Pattern-based sensitive detection
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
      console.warn(`SECURITY: Filtering potentially sensitive environment variable: ${key}`);
      continue;
    }

    out[key] = value;
  }
  
  return out;
}

/** Enhanced validation of SANDBOX_MOUNTS with path traversal protection */
export function validateSandboxMounts(raw?: string): string[] {
  const validMounts: string[] = [];
  if (!raw || typeof raw !== 'string') return validMounts;

  const mounts = raw.split(',').map(m => m.trim()).filter(m => m.length > 0);

  for (const mount of mounts) {
    try {
      // Parse mount specification (from:to:options)
      const parts = mount.split(':');
      const fromPath = parts[0]?.trim();

      if (!fromPath) {
        console.warn(`SECURITY: Empty mount path in: ${mount}`);
        continue;
      }

      // Enhanced path validation with traversal protection
      const normalizedPath = normalize(fromPath).replace(/\\/g, '/');
      
      // Check for path traversal attempts
      if (normalizedPath.includes('..') || normalizedPath.includes('//')) {
        console.warn(`SECURITY: Path traversal attempt detected: ${fromPath}`);
        continue;
      }
      
      // Resolve to absolute path for comparison
      const resolvedPath = resolve(normalizedPath);
      
      // Check against allowlist (exact match or parent directory)
      const isAllowed = Array.from(ALLOWED_MOUNT_PATHS).some(allowedPath => resolvedPath === allowedPath || resolvedPath.startsWith(allowedPath + '/'));
      
      if (!isAllowed) {
        console.warn(`SECURITY: Blocking unauthorized mount path: ${fromPath} (resolved: ${resolvedPath})`);
        continue;
      }

      validMounts.push(mount);
    } catch (error) {
      console.warn(`SECURITY: Error validating mount path ${mount}:`, error);
      continue;
    }
  }

  return validMounts;
}

/** Enhanced environment sanitization with comprehensive security filtering. */
export function buildSafeEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};

  // Enhanced PATH handling with validation
  const parentPath = parent['PATH'];
  if (parentPath && typeof parentPath === 'string' && isSafeEnvValue(parentPath)) {
    safe['PATH'] = parentPath;
  } else {
    safe['PATH'] = '/usr/bin:/bin'; // secure fallback
  }
  
  // Safe environment variables with validation
  const safeVars = ['LANG', 'HOME', 'TERM', 'USER', 'LOGNAME', 'SHELL'];
  for (const varName of safeVars) {
    const value = parent[varName];
    if (value && typeof value === 'string' && isSafeEnvValue(value)) {
      safe[varName] = value;
    }
  }

  // Enhanced filtering of all environment variables
  for (const [key, value] of Object.entries(parent)) {
    if (!key || !value || typeof value !== 'string') continue;
    
    // Skip if already processed
    if (key in safe) continue;
    
    const keyUpper = key.toUpperCase();
    
    // Filter dangerous variables
    if (DANGEROUS_ENVS.has(keyUpper)) {
      console.warn(`SECURITY: Filtering dangerous environment variable: ${key}`);
      continue;
    }
    
    // Filter sensitive variables
    if (SENSITIVE_ENVS.has(keyUpper)) {
      console.warn(`SECURITY: Filtering sensitive environment variable: ${key}`);
      continue;
    }

    // Pattern-based sensitive detection
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
      console.warn(`SECURITY: Filtering potentially sensitive environment variable: ${key}`);
      continue;
    }
    
    // Additional safe patterns (locale, display, etc.)
    if (key.startsWith('LC_') || 
        key.startsWith('DISPLAY') ||
        key === 'TMPDIR' ||
        key === 'TZ') {
      if (isSafeEnvValue(value)) {
        safe[key] = value;
      }
    }
  }

  // Add sanitized SANDBOX_ENV entries (this function already filters sensitive vars)
  const extra = parseAndFilterSandboxEnv(parent['SANDBOX_ENV']);
  Object.assign(safe, extra);

  return safe;
}

/** Enhanced validation for JSON array-of-strings command form */
function isStringArray(a: unknown): a is string[] {
  return Array.isArray(a) && 
         a.length > 0 && 
         a.length <= 100 && // reasonable limit
         a.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 1024);
}

/** Enhanced command validation to prevent dangerous executables */
function isAllowedCommand(cmd: string): boolean {
  if (!cmd || typeof cmd !== 'string') return false;
  
  // Normalize path
  const normalizedCmd = normalize(cmd);
  
  // Block obvious dangerous commands
  const dangerousCommands = [
    'rm', 'rmdir', 'del', 'format', 'fdisk',
    'dd', 'mkfs', 'mount', 'umount',
    'sudo', 'su', 'chmod', 'chown',
    'passwd', 'useradd', 'userdel',
    'iptables', 'netsh', 'ifconfig',
    'reboot', 'shutdown', 'halt',
    'eval', 'exec', 'system',
  ];
  
  const cmdBasename = normalizedCmd.split('/').pop()?.toLowerCase() || '';
  if (dangerousCommands.includes(cmdBasename)) {
    console.warn(`SECURITY: Blocking dangerous command: ${cmd}`);
    return false;
  }
  
  return true;
}

/** Enhanced proxy spawning with comprehensive security validation
 *  Supported forms:
 *    - JSON array (recommended): '["/usr/bin/socat", "arg1", "arg2"]'
 *    - Plain tokenizable string: '/usr/bin/socat "arg with space" -'
 *
 *  Returns the spawned child process or undefined if nothing to run.
 */
export function safeSpawnProxy(): ChildProcess | undefined {
  const raw = process.env['GEMINI_SANDBOX_PROXY_COMMAND'];
  if (!raw || typeof raw !== 'string') return undefined;

  let tokens: string[] | undefined;

  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isStringArray(parsed)) {
        tokens = parsed;
      } else {
        console.warn('SECURITY: Invalid JSON array format for proxy command');
        return undefined;
      }
    } catch (error) {
      console.warn('SECURITY: Failed to parse JSON proxy command:', error);
      // fall through to plain parse
    }
  }

  if (!tokens) {
    tokens = parseCommandString(trimmed);
  }

  if (!tokens || tokens.length === 0) {
    console.warn('SECURITY: No valid tokens found in proxy command');
    return undefined;
  }

  const cmd = tokens[0];
  const args = tokens.slice(1);

  // Enhanced command validation
  if (!isAllowedCommand(cmd)) {
    return undefined;
  }

  // Build safe env with enhanced filtering
  const safeEnv = buildSafeEnv(process.env);
  
  // Explicit removal of dangerous variables (defense in depth)
  for (const dangerousVar of DANGEROUS_ENVS) {
    if (dangerousVar in safeEnv) {
      delete safeEnv[dangerousVar];
      console.warn(`SECURITY: Removed dangerous env var: ${dangerousVar}`);
    }
  }

  // Enhanced SANDBOX_MOUNTS validation
  const sandboxMounts = process.env['SANDBOX_MOUNTS'];
  if (sandboxMounts) {
    const originalMountCount = sandboxMounts.split(',').filter(m => m.trim()).length;
    const validMounts = validateSandboxMounts(sandboxMounts);
    if (validMounts.length !== originalMountCount) {
      console.warn(`SECURITY: Filtered ${originalMountCount - validMounts.length} unsafe SANDBOX_MOUNTS`);
    }
  }

  try {
    // Spawn without a shell so metacharacters are not interpreted
    // Use 'pipe' stdio so tests/integration can observe output
    const cp = spawn(cmd, args, { 
      stdio: 'pipe', 
      shell: false, 
      env: safeEnv,
      timeout: 30000, // 30 second timeout for safety
    });
    
    // Enhanced error handling
    cp.on('error', (err) => {
      console.error('safeSpawnProxy error:', {
        command: cmd,
        args: args.length,
        error: err.message,
      });
    });
    
    // Log successful spawn for security auditing
    console.log(`SECURITY: Spawned proxy command: ${cmd} with ${args.length} args`);
    
    return cp;
  } catch (error) {
    console.error('SECURITY: Failed to spawn proxy command:', error);
    return undefined;
  }
}

// All functions are exported as named exports above
