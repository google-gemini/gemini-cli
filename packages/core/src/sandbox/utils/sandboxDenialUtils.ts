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
  ].some((keyword) => combined.includes(keyword));

  if (!isFileDenial && !isNetworkDenial) {
    return undefined;
  }

  const filePaths = new Set<string>();

  // Extract denied paths (POSIX absolute paths)
  const regex =
    /(?:^|\s)['"]?(\/[\w.-/]+)['"]?:\s*[Oo]peration not permitted/gi;
  let match;
  while ((match = regex.exec(output)) !== null) {
    filePaths.add(match[1]);
  }
  if (errorOutput) {
    while ((match = regex.exec(errorOutput)) !== null) {
      filePaths.add(match[1]);
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
