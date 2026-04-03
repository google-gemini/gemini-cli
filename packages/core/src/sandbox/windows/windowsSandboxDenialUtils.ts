/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ParsedSandboxDenial } from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';

/**
 * Windows-specific sandbox denial detection.
 * Extracts paths from "Access is denied" and related errors.
 */
export function parseWindowsSandboxDenials(
  result: ShellExecutionResult,
): ParsedSandboxDenial | undefined {
  const output = result.output || '';
  const errorOutput = result.error?.message;
  const combined = (output + ' ' + (errorOutput || '')).toLowerCase();

  const isFileDenial = [
    'access is denied',
    'access to the path',
    'unauthorizedaccessexception',
    '0x80070005',
    'eperm: operation not permitted',
  ].some((keyword) => combined.includes(keyword));

  const isNetworkDenial = [
    'eacces: permission denied',
    'an attempt was made to access a socket in a way forbidden by its access permissions',
    // 10013 is WSAEACCES
    '10013',
  ].some((keyword) => combined.includes(keyword));

  if (!isFileDenial && !isNetworkDenial) {
    return undefined;
  }

  const filePaths = new Set<string>();

  // Regex for Windows absolute paths (e.g., C:\Path or \\?\C:\Path)
  // Handles drive letters and potentially quoted paths.
  // We use two passes: one for quoted paths (which can contain spaces)
  // and one for unquoted paths (which end at common separators).

  // 1. Quoted paths: 'C:\Foo Bar' or "C:\Foo Bar"
  const quotedRegex = /['"]((?:\\\\(?:\?|\.)\\)?[a-zA-Z]:[\\/][^'"]+)['"]/g;
  for (const match of output.matchAll(quotedRegex)) {
    filePaths.add(match[1]);
  }
  if (errorOutput) {
    for (const match of errorOutput.matchAll(quotedRegex)) {
      filePaths.add(match[1]);
    }
  }

  // 2. Unquoted paths or paths in PowerShell error format: PermissionDenied: (C:\path:String)
  const generalRegex =
    /(?:^|[\s(])((?:\\\\(?:\?|\.)\\)?[a-zA-Z]:[\\/][^"'\s()<>|?*]+)/g;
  for (const match of output.matchAll(generalRegex)) {
    // Clean up trailing colon which might be part of the error message rather than the path
    let p = match[1];
    if (p.endsWith(':')) p = p.slice(0, -1);
    filePaths.add(p);
  }
  if (errorOutput) {
    for (const match of errorOutput.matchAll(generalRegex)) {
      let p = match[1];
      if (p.endsWith(':')) p = p.slice(0, -1);
      filePaths.add(p);
    }
  }

  return {
    network: isNetworkDenial || undefined,
    filePaths: filePaths.size > 0 ? Array.from(filePaths) : undefined,
  };
}
