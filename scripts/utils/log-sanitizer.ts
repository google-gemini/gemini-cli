/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Best-effort path redaction and high-confidence secret
 * detection for the small set of user-approved values allowed into generated
 * eval drafts. This is not a guarantee that arbitrary content is safe to
 * publish, so every draft still requires human review.
 */

import os from 'node:os';

export interface SanitizationOptions {
  workspaceRoot?: string;
  stripHomePaths?: boolean;
}

export interface SensitiveFinding {
  category: string;
  line: number;
}

export const WORKSPACE_PLACEHOLDER = '<workspace>';
export const HOME_PLACEHOLDER = '<home>';

const SENSITIVE_PATTERNS: Array<{
  category: string;
  pattern: RegExp;
}> = [
  {
    category: 'private key',
    pattern:
      /-----BEGIN (?:(?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/,
  },
  {
    category: 'authorization bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  },
  {
    category: 'authorization basic credential',
    pattern: /\bBasic\s+[A-Za-z0-9+/=]{16,}/i,
  },
  {
    category: 'credential-bearing URL',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]{8,}@/i,
  },
  {
    category: 'API key assignment',
    pattern:
      /(?:^|[^\w])["']?(?:GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY)["']?\s*[:=]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s"']{8,})/i,
  },
  {
    category: 'credential assignment',
    pattern:
      /(?:^|[^\w])["']?(?:password|passwd|secret|token|credential|client_secret|aws_secret_access_key)["']?\s*[:=]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s"']{8,})/i,
  },
  {
    category: 'known token format',
    // Keep overlapping high-confidence formats aligned with
    // NEVER_ALLOWED_VALUE_PATTERNS in core. Detection remains best effort.
    pattern:
      /\b(?:AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|GOCSPX-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{24,})\b/,
  },
  {
    category: 'JSON web token',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacePathLiteral(
  content: string,
  value: string,
  replacement: string,
): string {
  if (!value) {
    return content;
  }

  const flags = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/.test(value) ? 'gi' : 'g';
  const pattern = new RegExp(
    `(^|[Ff][Ii][Ll][Ee]:\\/\\/\\/?|[^A-Za-z0-9._~\\\\/-])${escapeRegExp(value)}(?![A-Za-z0-9._~-])`,
    flags,
  );
  return content.replace(
    pattern,
    (_match, prefix: string) => `${prefix}${replacement}`,
  );
}

/**
 * Reports only a category and line number. It never returns the matched value.
 */
export function findSensitiveContent(content: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  const seen = new Set<string>();

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const { category, pattern } of SENSITIVE_PATTERNS) {
      if (!pattern.test(line)) {
        continue;
      }
      const key = `${category}:${index + 1}`;
      if (!seen.has(key)) {
        findings.push({ category, line: index + 1 });
        seen.add(key);
      }
    }
  }

  return findings;
}

/**
 * Redacts machine-specific workspace and home paths. Secret-bearing content is
 * rejected by the caller instead of being silently mutated here.
 */
export function sanitizeContent(
  content: string,
  options: SanitizationOptions = {},
): string {
  const { workspaceRoot, stripHomePaths = true } = options;
  let result = content;

  if (workspaceRoot) {
    result = replacePathLiteral(result, workspaceRoot, WORKSPACE_PLACEHOLDER);
    result = replacePathLiteral(
      result,
      workspaceRoot.replace(/\\/g, '/'),
      WORKSPACE_PLACEHOLDER,
    );
  }

  if (stripHomePaths) {
    const home = os.homedir();
    result = replacePathLiteral(result, home, HOME_PLACEHOLDER);
    result = replacePathLiteral(
      result,
      home.replace(/\\/g, '/'),
      HOME_PLACEHOLDER,
    );
  }

  return result;
}
