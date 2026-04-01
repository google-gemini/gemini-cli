/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ParsedSandboxDenial } from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';

/**
 * Common POSIX-style sandbox denial detection.
 * Used by macOS and Linux sandbox managers.
 */
export function parsePosixSandboxDenials(
  result: ShellExecutionResult,
): ParsedSandboxDenial | undefined {
  const output = result.output || '';
  const errorOutput = result.error?.message;
  const combined = (output + ' ' + (errorOutput || '')).toLowerCase();

  const isFileDenial = [
    'operation not permitted',
    'permission denied',
    'eperm',
    'eacces',
    'vim:e303',
    'should be read/write',
    'sandbox_apply',
    'sandbox: ',
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
  ].some((keyword) => combined.includes(keyword));

  if (!isFileDenial && !isNetworkDenial) {
    return undefined;
  }

  const filePaths = new Set<string>();

  // Extract denied paths (POSIX absolute paths or home-relative paths starting with ~)
  const regexes = [
    // format: /path: operation not permitted
    /(?:^|\s)['"]?((?:\/|~)[\w.\-/:~]+)['"]?:\s*[Oo]peration not permitted/gi,
    // format: operation not permitted, open '/path'
    /[Oo]peration not permitted,\s*open\s*['"]?((?:\/|~)[\w.\-/:~]+)['"]?/gi,
    // format: permission denied, open '/path'
    /[Pp]ermission denied,\s*open\s*['"]?((?:\/|~)[\w.\-/:~]+)['"]?/gi,
    // format: npm error path /path or npm ERR! path /path
    /npm\s+(?:error|ERR!)\s+path\s+((?:\/|~)[\w.\-/:~]+)/gi,
    // format: EACCES: permission denied, mkdir '/path'
    /EACCES:\s*permission denied,\s*\w+\s*['"]?((?:\/|~)[\w.\-/:~]+)['"]?/gi,
  ];

  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(output)) !== null) {
      filePaths.add(match[1]);
    }
    if (errorOutput) {
      regex.lastIndex = 0; // Reset for next use
      while ((match = regex.exec(errorOutput)) !== null) {
        filePaths.add(match[1]);
      }
    }
  }

  // Fallback heuristic: look for any absolute path in the output if it was a file denial
  if (isFileDenial && filePaths.size === 0) {
    const fallbackRegex =
      /(?:^|[\s"'[\]])(\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)(?:$|[\s"'[\]:])/gi;
    let m;
    while ((m = fallbackRegex.exec(output)) !== null) {
      const p = m[1];
      if (p && !p.startsWith('/bin/') && !p.startsWith('/usr/bin/')) {
        filePaths.add(p);
      }
    }
    if (errorOutput) {
      while ((m = fallbackRegex.exec(errorOutput)) !== null) {
        const p = m[1];
        if (p && !p.startsWith('/bin/') && !p.startsWith('/usr/bin/')) {
          filePaths.add(p);
        }
      }
    }
  }

  return {
    network: isNetworkDenial || undefined,
    filePaths: filePaths.size > 0 ? Array.from(filePaths) : undefined,
  };
}
