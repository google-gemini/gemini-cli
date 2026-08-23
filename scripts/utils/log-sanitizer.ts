/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Sanitization utilities for session log data.
 *
 * Strips PII, secrets, and machine-specific absolute paths from content
 * extracted from session JSONL files before it is embedded in generated evals.
 * The strategy is to preserve file content fully (for realistic evals) while
 * replacing only patterns that would make the eval non-portable or unsafe to
 * check in.
 */

import os from 'node:os';
import path from 'node:path';

export interface SanitizationOptions {
  /**
   * The workspace root directory. Absolute paths under this directory are
   * replaced with paths relative to `<workspace>/`.
   */
  workspaceRoot?: string;

  /**
   * Whether to strip secret patterns (API keys, tokens, private keys).
   * Defaults to true.
   */
  stripSecrets?: boolean;

  /**
   * Whether to replace the home directory prefix in paths.
   * Defaults to true.
   */
  stripHomePaths?: boolean;
}

/** Placeholder used in place of the user's workspace root in paths. */
export const WORKSPACE_PLACEHOLDER = '<workspace>';

/** Placeholder used in place of the user's home directory in paths. */
export const HOME_PLACEHOLDER = '<home>';

/** Placeholder used in place of redacted secret values. */
export const REDACTED_PLACEHOLDER = '<REDACTED>';

/**
 * Secret patterns to scrub. Order matters — more specific patterns first.
 * Each entry: [regex, replacement].
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // PEM private keys
  [
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    `-----BEGIN PRIVATE KEY-----\n${REDACTED_PLACEHOLDER}\n-----END PRIVATE KEY-----`,
  ],
  // Bearer tokens in Authorization headers
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, `Bearer ${REDACTED_PLACEHOLDER}`],
  // API key environment variable assignments (shell/dotenv style)
  [
    /(?:GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY)\s*=\s*["']?[A-Za-z0-9\-._~+/]{20,}["']?/g,
    (match: string) => match.split('=')[0] + `=${REDACTED_PLACEHOLDER}`,
  ],
  // Generic "password = ..." assignments
  [
    /(?:password|passwd|secret|token|credential)\s*[:=]\s*["']?[^\s"']{8,}["']?/gi,
    (match: string) => {
      const sep = match.includes(':') ? ':' : '=';
      return match.split(sep)[0] + sep + ` ${REDACTED_PLACEHOLDER}`;
    },
  ],
];

/**
 * Replaces occurrences of a directory path in content with a placeholder.
 * Handles both forward slash and backslash variants.
 */
function replacePathInContent(
  content: string,
  dirPath: string,
  placeholder: string,
): string {
  if (!dirPath) return content;

  // Escape special regex chars in the directory path
  const escaped = dirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match both forward-slash and backslash normalizations
  const forwardSlash = dirPath.replace(/\\/g, '/');
  const escapedForward = forwardSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace backslash variant (Windows)
  content = content.replace(new RegExp(escaped, 'g'), placeholder);
  // Replace forward-slash variant
  content = content.replace(new RegExp(escapedForward, 'g'), placeholder);

  return content;
}

/**
 * Sanitizes a single string value (file content, prompt text, tool arg, etc.)
 * by replacing absolute paths and secrets with safe placeholders.
 */
export function sanitizeContent(
  content: string,
  options: SanitizationOptions = {},
): string {
  const { workspaceRoot, stripSecrets = true, stripHomePaths = true } = options;

  let result = content;

  // Replace workspace root first (most specific, so do it before home)
  if (workspaceRoot) {
    result = replacePathInContent(result, workspaceRoot, WORKSPACE_PLACEHOLDER);
  }

  // Replace home directory
  if (stripHomePaths) {
    const home = os.homedir();
    if (home) {
      result = replacePathInContent(result, home, HOME_PLACEHOLDER);
    }
  }

  // Strip secrets
  if (stripSecrets) {
    for (const [pattern, replacement] of SECRET_PATTERNS) {
      if (typeof replacement === 'string') {
        result = result.replace(pattern, replacement);
      } else {
        result = result.replace(
          pattern,
          replacement as (match: string) => string,
        );
      }
    }
  }

  return result;
}

/**
 * Sanitizes all keys and values in a file map (path → content).
 * Keys (file paths) are made workspace-relative.
 * Values (file contents) go through full sanitization.
 */
export function sanitizeFileMap(
  files: Record<string, string>,
  options: SanitizationOptions = {},
): Record<string, string> {
  const { workspaceRoot } = options;
  const result: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    // Normalize the key to be workspace-relative
    let normalizedKey = filePath;
    if (workspaceRoot && path.isAbsolute(filePath)) {
      // Resolve the path to collapse any '..' segments before comparing
      const resolved = path.resolve(filePath);
      const rel = path.relative(workspaceRoot, resolved);
      // Only use the relative path if it stays within the workspace root.
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        normalizedKey = rel.replace(/\\/g, '/');
      } else {
        // Path is outside workspace (e.g. traversal attack or system file) — skip it
        continue;
      }
    }

    result[normalizedKey] = sanitizeContent(content, options);
  }

  return result;
}

/**
 * Sanitizes a file path string, making it workspace-relative if possible.
 */
export function sanitizePath(
  filePath: string,
  options: SanitizationOptions = {},
): string {
  const { workspaceRoot } = options;

  if (workspaceRoot && path.isAbsolute(filePath)) {
    const rel = path.relative(workspaceRoot, filePath);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/');
    }
  }

  // Fall back to generic content sanitization for absolute path placeholders
  return sanitizeContent(filePath, options);
}
