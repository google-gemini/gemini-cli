/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight, cache-friendly token parser and validator optimized for CLI use.
 */

type TokenInfo = {
  valid: boolean;
  exp?: number;
  projectId?: string;
  scopes?: readonly string[];
  reason?: string;
};

const tokenCache = new Map<string, TokenInfo>();

function b64urlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function clearTokenCache(): void {
  tokenCache.clear();
}

export function getCachedTokenProject(token: string): string | undefined {
  return tokenCache.get(token)?.projectId;
}

/**
 * Validates token shape and returns project scoping info.
 * Keeps hot-path behavior with memoization for repeated checks.
 */
export function validateIntelligentTokenProjectScope(
  token: string,
  expectedProjectId?: string,
): TokenInfo {
  const cached = tokenCache.get(token);
  if (cached) return cached;

  const fail = (reason: string): TokenInfo => {
    const v = { valid: false, reason } as TokenInfo;
    tokenCache.set(token, v);
    return v;
  };

  try {
    if (!token || typeof token !== 'string') return fail('empty');
    const parts = token.split('.');
    if (parts.length !== 3) return fail('format');

    const header = JSON.parse(b64urlDecode(parts[0]));
    const payload = JSON.parse(b64urlDecode(parts[1]));
    if (!payload || typeof payload !== 'object') return fail('payload');

    const now = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp);
    const iat = Number(payload.iat);
    const iss = String(payload.iss || '');
    const aud = String(payload.aud || '');

    if (!iss || !aud || !exp || !iat) return fail('claims');
    if (exp < now) return fail('expired');
    if (iat > now + 300) return fail('iat-skew'); // allow 5m skew

    const projectId: string | undefined =
      payload['https://cloud.google.com/project'] || payload.project_id || aud.split('/')[1];
    if (!projectId) return fail('project');
    if (expectedProjectId && projectId !== expectedProjectId) return fail('project-mismatch');

    const scopes: string[] | undefined = Array.isArray(payload.scope)
      ? payload.scope as string[]
      : typeof payload.scope === 'string'
        ? String(payload.scope).split(/[\s,]+/).filter(Boolean)
        : undefined;

    const info: TokenInfo = { valid: true, exp, projectId, scopes };
    tokenCache.set(token, info);
    return info;
  } catch {
    return fail('parse');
  }
}

