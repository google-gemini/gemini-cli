/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LRUCache } from 'mnemonist';
import { type ParsedSandboxDenial } from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import { isValidPathString } from '../../utils/paths.js';

/**
 * Type for the sandbox denial error cache.
 * Stores normalized error output to prevent redundant processing.
 */
export type SandboxDenialCache = LRUCache<string, boolean>;

/**
 * Creates a new sandbox denial cache with a standard LRU policy.
 */
export function createSandboxDenialCache(maxSize = 10): SandboxDenialCache {
  return new LRUCache<string, boolean>(maxSize);
}

/**
 * Sanitizes extracted paths to prevent path traversal vulnerabilities.
 * Filters out paths containing '..' or null bytes.
 */
export function sanitizeExtractedPath(p: string): string | undefined {
  if (!isValidPathString(p)) return undefined;

  // Reject paths with directory traversal components
  const parts = p.split(/[/\\]/);
  if (parts.includes('..')) {
    return undefined;
  }

  // Reject paths with internal tildes (tilde should only be at the beginning)
  if (p.indexOf('~') > 0) {
    return undefined;
  }

  // Basic normalization without resolving symlinks or accessing the file system
  let normalized = p;

  // Collapse multiple slashes
  normalized = normalized.replace(/\/+/g, '/');

  // Remove single dot segments
  normalized = normalized.replace(/\/\.\//g, '/');

  // Remove trailing slashes (unless it's exactly '/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Common POSIX-style sandbox denial detection.
 * Used by macOS and Linux sandbox managers.
 */
export function parsePosixSandboxDenials(
  result: ShellExecutionResult,
  cache?: SandboxDenialCache,
): ParsedSandboxDenial | undefined {
  const output = result.output || '';
  const errorOutput = result.error?.message;
  const fullText = output + '\n' + (errorOutput || '');
  const combined = fullText.toLowerCase();

  // Cache by the first 200 characters of the error to handle variable data (timestamps, PIDs)
  const cacheKey = combined.trim().slice(0, 200);
  if (cacheKey && cache?.has(cacheKey)) {
    return undefined;
  }

  const isFileDenial = [
    'operation not permitted',
    'permission denied',
    'eperm',
    'eacces',
    'vim:e303',
    'should be read/write',
    'sandbox_apply',
    'sandbox: ',
    'access denied',
    'read-only file system',
    'permissionerror',
    'fs.permissiondenied',
    'forbidden',
    'system.unauthorizedaccessexception',
  ].some((keyword) => combined.includes(keyword));

  const isNetworkDenial = [
    'error connecting to',
    'network is unreachable',
    'could not resolve host',
    'connection refused',
    'no address associated with hostname',
    'econnrefused',
    'enotfound',
    'etimedout',
    'econnreset',
    'network error',
    'getaddrinfo',
    'socket hang up',
    'connect-timeout',
    'err_pnpm_fetch',
    'err_pnpm_no_matching_version',
    "syscall: 'listen'",
    'socketexception',
    'networkaccessdenied',
  ].some((keyword) => combined.includes(keyword));

  if (!isFileDenial && !isNetworkDenial) {
    return undefined;
  }

  const filePaths = new Set<string>();

  // Extract denied paths (POSIX absolute paths or home-relative paths starting with ~)
  const regexes = [
    // format: /path: operation not permitted
    /(?:^|\s)['"]?((?:\/|~)(?:[\w.\-/:~]*[\w.\-/~])?)['"]?[\s:,'"[\]]*operation not permitted/gi,
    // format: operation not permitted, open '/path'
    /operation not permitted[\s:,'"[\]]*open[\s:,'"[\]]*['"]?((?:\/|~)(?:[\w.\-/:~]*[\w.\-/~])?)['"]?/gi,
    // format: permission denied, open '/path'
    /permission denied[\s:,'"[\]]*open[\s:,'"[\]]*['"]?((?:\/|~)(?:[\w.\-/:~]*[\w.\-/~])?)['"]?/gi,
    // format: npm error path /path or npm ERR! path /path
    /npm[\s!]*[A-Za-z]*err[A-Za-z!]*[\s!]+path[\s!]*((?:\/|~)(?:[\w.\-/:~]*[\w.\-/~])?)/gi,
    // format: eacces: permission denied, mkdir '/path'
    /eacces[\s:,'"[\]]*permission denied[\s:,'"[\]]*\w+[\s:,'"[\]]*['"]?((?:\/|~)[\w.\-/:~]*[\w.\-/~])?/gi,
    // format: PermissionError: [Errno 13] Permission denied: '/path'
    /permissionerror[\s:,'"[\]]*(?:[^'"]*)['"]((?:\/|~)[\w.\-/:~]*[\w.\-/~])?['"]/gi,
    // format: FileNotFoundError: [Errno 2] No such file or directory: '/path' (sometimes returned in sandbox denials if directory is hidden)
    /filenotfounderror[\s:,'"[\]]*(?:[^'"]*)['"]((?:\/|~)[\w.\-/:~]*[\w.\-/~])?['"]/gi,
    // format: Error: EACCES: permission denied, open '/path'
    /error[\s:,'"[\]]*eacces[\s:,'"[\]]*permission denied[\s:,'"[\]]*(?:[^'"]*)['"]((?:\/|~)[\w.\-/:~]*[\w.\-/~])?['"]/gi,
  ];

  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const sanitized = sanitizeExtractedPath(match[1]);
      if (sanitized) filePaths.add(sanitized);
    }
  }

  // Fallback heuristic: look for any absolute path in the output if it was a file denial
  if (isFileDenial && filePaths.size === 0) {
    const fallbackRegex =
      /(?:^|[\s"'[\]])(\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)(?:$|[\s"'[\]:])/gi;
    let m;
    while ((m = fallbackRegex.exec(fullText)) !== null) {
      const sanitized = sanitizeExtractedPath(m[1]);
      if (sanitized) filePaths.add(sanitized);
    }
  }

  if (cacheKey && cache) {
    cache.set(cacheKey, true);
  }

  return {
    network: isNetworkDenial || undefined,
    filePaths: filePaths.size > 0 ? Array.from(filePaths) : undefined,
  };
}
