/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';

/**
 * Escapes a string for safe use as a shell argument.
 * This prevents command injection when constructing shell commands.
 * Detects the platform and uses appropriate escaping rules.
 * 
 * @param str The string to escape
 * @returns The escaped string safe for shell use
 */
export function escapeShellArg(str: string): string {
  // Detect the platform and use appropriate escaping
  if (os.platform() === 'win32') {
    return escapeShellArgWindows(str);
  } else {
    return escapeShellArgPosix(str);
  }
}

/**
 * Escapes a string for POSIX-compliant shells (bash, sh, zsh, etc.)
 * Uses single quotes and the '\'' pattern for embedded quotes.
 */
function escapeShellArgPosix(str: string): string {
  // For empty strings, return quoted empty string
  if (str === '') {
    return "''";
  }

  // Check if the string contains any characters that need escaping
  // This includes backticks, which can cause command substitution
  const needsEscaping = /[^A-Za-z0-9_\-.\/]/.test(str);
  
  if (!needsEscaping) {
    return str;
  }

  // Use single quotes to prevent all expansions (including backtick command substitution)
  // Single quotes preserve everything literally except for single quotes themselves
  // To include a single quote, we end the quoted string, add an escaped single quote, and start a new quoted string
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Escapes a string for Windows cmd.exe
 * Uses double quotes and escapes special characters within them.
 */
function escapeShellArgWindows(str: string): string {
  // For empty strings, return quoted empty string
  if (str === '') {
    return '""';
  }

  // Check if the string contains any characters that need escaping
  // Windows has different special characters that need escaping
  const needsEscaping = /[^A-Za-z0-9_\-.]/.test(str);
  
  if (!needsEscaping) {
    return str;
  }

  // For Windows cmd.exe, we need to:
  // 1. Escape special characters with ^
  // 2. Double up quotes
  // 3. Handle percent signs specially
  
  let escaped = str;
  
  // Escape special cmd.exe metacharacters with ^
  // These include: & | < > ^ " %
  escaped = escaped.replace(/([&|<>^])/g, '^$1');
  
  // Double up quotes for cmd.exe
  escaped = escaped.replace(/"/g, '""');
  
  // Percent signs need special handling - double them
  escaped = escaped.replace(/%/g, '%%');
  
  // Wrap in double quotes
  return '"' + escaped + '"';
}

/**
 * Escapes a commit message for safe use with git commit -m
 * @param message The commit message to escape
 * @returns The properly escaped commit message
 */
export function escapeGitCommitMessage(message: string): string {
  return escapeShellArg(message);
}