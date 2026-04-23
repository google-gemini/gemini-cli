/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

export interface SecretMatch {
  type: string;
  value: string;
  redacted: string;
}

export interface SecretScanResult {
  matches: SecretMatch[];
  sanitized: string;
}

interface PatternDef {
  type: string;
  re: RegExp;
}

const SECRET_PATTERNS: PatternDef[] = [
  // AWS key ID prefixes — all valid prefixes per AWS IAM docs
  { type: 'aws_key_id', re: /\b(AKIA|ASIA|AROA|AIDA|AGPA|ANPA)[A-Z0-9]{16}\b/g },
  // GitHub tokens: classic PAT, OAuth, server-to-server, refresh
  { type: 'github_token', re: /\bgh[psor]_[A-Za-z0-9]{36,255}\b/g },
  // Google API keys
  { type: 'google_api_key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  // Slack tokens
  { type: 'slack_token', re: /\bxox[bpsa]-[A-Za-z0-9\-]{10,}/g },
  // PEM private key headers — very high confidence
  { type: 'private_key', re: /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/g },
  // Connection strings with embedded credentials
  {
    type: 'connection_string',
    re: /(postgres|mysql|mongodb|redis):\/\/[^:@\s]{1,200}:[^@\s]{1,200}@/gi,
  },
  // JWT — only when appearing as an assignment value or after a colon (reduces false positives on arbitrary base64)
  {
    type: 'jwt',
    re: /(?:(?:Authorization|Bearer|token|jwt)\s*[:=]\s*|["'])(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/gi,
  },
];

/** Filename patterns that indicate the file likely contains credentials. */
const SENSITIVE_FILENAME_PATTERNS = [
  /^\.env($|\.)/i,
  /\.env$/i,
  /^id_(rsa|ed25519|ecdsa|dsa)$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /^(terraform|.*secrets?|.*credentials?)\.tfvars$/i,
  /(?:^|[-_.])secrets?(?:[-_.]|$)/i,
  /(?:^|[-_.])credentials?(?:[-_.]|$)/i,
  /(?:^|[-_.])passwords?(?:[-_.]|$)/i,
];

/** Returns true if the filename indicates likely credential content. */
export function isSensitiveFilename(filePath: string): boolean {
  const basename = path.basename(filePath);
  return SENSITIVE_FILENAME_PATTERNS.some((re) => re.test(basename));
}

/**
 * Scans text content for known secret patterns and replaces matches with
 * `[REDACTED:type]` placeholders.
 */
export function scanAndRedact(content: string): SecretScanResult {
  const matches: SecretMatch[] = [];
  let sanitized = content;

  for (const { type, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    sanitized = sanitized.replace(re, (match) => {
      matches.push({ type, value: match, redacted: `[REDACTED:${type}]` });
      return `[REDACTED:${type}]`;
    });
  }

  return { matches, sanitized };
}

/** Returns a human-readable summary of detected secrets. */
export function summarizeSecrets(matches: SecretMatch[]): string {
  if (matches.length === 0) return '';
  const byType = new Map<string, number>();
  for (const m of matches) {
    byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
  }
  return Array.from(byType.entries())
    .map(([t, n]) => `${n}x ${t}`)
    .join(', ');
}
