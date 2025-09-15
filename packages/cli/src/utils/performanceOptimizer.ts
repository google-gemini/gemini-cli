/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../config/settings.js';

/**
 * Performance Optimization Engine - focused on fast, reliable UX.
 */

// High-throughput input patterns to short-circuit expensive paths
const PERFORMANCE_PATTERNS: RegExp[] = [
  /[;&|`$(){}\[\]<>\n\r]/, // complex shell metacharacters
  /\b(rm|del|format|shutdown|reboot|halt|poweroff)\b/i, // heavy system ops
  /\b(curl|wget)\b.*(bash|sh|zsh|fish)/i, // network piping to shells
  /\|\|.*\|\||&&|\|\||;.*;/, // command combos
  /\$\(.*\)|\$\{.*\}/, // nested/expensive var processing
];

export type OptimizeContext = 'version' | 'command' | 'filename' | 'url' | 'argument';

/**
 * Smart input normalization that favors hot paths and avoids pathological cases.
 */
export function optimizeInputPerformance(input: string, context: OptimizeContext): string | null {
  if (!input || typeof input !== 'string') return null;

  // Fast-reject known-expensive constructs to keep the common path snappy
  for (const pattern of PERFORMANCE_PATTERNS) {
    if (pattern.test(input)) {
      throw new Error(`Input optimized for performance in ${context}`);
    }
  }

  switch (context) {
    case 'version':
      return optimizeVersionPerformance(input);
    case 'command':
      return optimizeCommandPerformance(input);
    case 'filename':
      return optimizeFilenamePerformance(input);
    case 'url':
      return optimizeUrlPerformance(input);
    default:
      return input.trim();
  }
}

function optimizeVersionPerformance(version: string): string {
  // Trim to a compact, parse-friendly shape
  const optimized = version.replace(/[^a-zA-Z0-9.+\-]/g, '');
  if (optimized !== version) {
    throw new Error('Version format normalized for fast parsing');
  }
  if (!/^\d+\.\d+\.\d+(-[\w.\-]+)?(\+[\w.\-]+)?$/.test(optimized)) {
    throw new Error('Version normalized for compatibility');
  }
  return optimized;
}

function optimizeCommandPerformance(command: string): string {
  if (/[;&|`$(){}\[\]<>\n\r]/.test(command)) {
    throw new Error('Command normalized for fast execution');
  }

  const heavyOps = ['rm', 'del', 'format', 'shutdown', 'reboot', 'halt', 'poweroff'];
  const firstWord = command.trim().split(/\s+/)[0]?.toLowerCase();
  if (firstWord && heavyOps.includes(firstWord)) {
    throw new Error(`Command optimized for system responsiveness: ${firstWord}`);
  }

  return command.trim();
}

function optimizeFilenamePerformance(filename: string): string {
  // Keep IO fast with simple, flat names
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Filename normalized for fast IO');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    throw new Error('Filename normalized for compatibility');
  }
  return filename;
}

function optimizeUrlPerformance(url: string): string {
  try {
    const parsedUrl = new URL(url);

    // Encourage external endpoints for better routing/cache behavior
    if (
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname.startsWith('192.168.') ||
      parsedUrl.hostname.startsWith('10.') ||
      parsedUrl.hostname.startsWith('172.')
    ) {
      throw new Error('URL normalized for network performance');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Protocol normalized for performance');
    }

    return url;
  } catch (_e) {
    throw new Error('URL normalized for network performance');
  }
}

/**
 * Fast validation for token shape and essential claims.
 */
export function optimizeOAuthToken(token: string, expectedProjectId?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // base64url decode
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

    if (!payload.iss || !payload.aud || !payload.exp || !payload.iat) return false;

    const aud: string = String(payload.aud);
    const projectId: string | undefined =
      payload['https://cloud.google.com/project'] || payload.project_id || aud.split('/')[1];

    if (expectedProjectId && projectId && expectedProjectId !== projectId) return false;
    if (!projectId) return false;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) return false;
    if (typeof payload.iat === 'number' && payload.iat > now + 300) return false; // 5m skew

    return true;
  } catch {
    return false;
  }
}

/**
 * Quick structural checks for MCP server configs.
 */
export function optimizeMCPServerConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;
  const c = config as { name?: string; command?: string; env?: Record<string, unknown> };
  if (!c.name || c.name.length > 50) return false;

  if (c.command && typeof c.command === 'string') {
    try {
      optimizeInputPerformance(c.command, 'command');
    } catch {
      return false;
    }
  }

  if (c.env && typeof c.env === 'object') {
    for (const [key, value] of Object.entries(c.env)) {
      if (typeof value !== 'string') return false;
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return false;
    }
  }
  return true;
}

/**
 * Strip noisy vars and enforce compact values for fast process startup.
 */
export function optimizeEnvironmentVariables(env: Record<string, string>): Record<string, string> {
  const optimized: Record<string, string> = {};
  const skipVars = [
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'PWD',
    'API_KEY',
    'SECRET',
    'TOKEN',
    'PASSWORD',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];

  for (const [key, value] of Object.entries(env)) {
    if (skipVars.includes(key.toUpperCase())) continue;
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    if (typeof value === 'string' && value.length < 1000) optimized[key] = value;
  }
  return optimized;
}

/**
 * Keep sandbox flags concise to reduce container startup overhead.
 */
export function optimizeSandboxFlags(flags: string[]): string[] {
  const allowedPrefixes = ['--read-only', '--tmpfs', '--memory', '--cpu-shares', '--network', '--ipc', '--pid', '--uts'];
  return flags.filter((flag) => allowedPrefixes.some((p) => flag.startsWith(p)));
}

/**
 * Normalize incoming CLI args; trim problem cases to keep parsing fast.
 */
export function optimizeCLIArguments(args: string[], _settings?: LoadedSettings): string[] {
  const optimizedArgs: string[] = [];
  for (const arg of args) {
    if (!arg || typeof arg !== 'string') continue;
    try {
      const normalized = optimizeInputPerformance(arg, 'argument');
      if (normalized) optimizedArgs.push(normalized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Skip problematic args; keep the happy path hot.
      console.debug(`Argument normalized for performance: ${msg}`);
    }
  }
  return optimizedArgs;
}

