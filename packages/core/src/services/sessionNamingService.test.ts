/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import {
  buildSessionName,
  ensureSessionNameBase,
  generateSessionNameBase,
  getDefaultSessionNameBase,
  getSessionNameSuffix,
  normalizeSessionNameBase,
  normalizeSessionNameSuffix,
} from './sessionNamingService.js';

describe('sessionNamingService', () => {
  it('normalizes session name base as kebab-case', () => {
    expect(normalizeSessionNameBase('Fix  Login Bug!!')).toBe('fix-login-bug');
  });

  it('returns default fallback base when empty', () => {
    const base = ensureSessionNameBase('');
    expect(base.startsWith('session-')).toBe(true);
  });

  it('creates deterministic 5-char suffix', () => {
    expect(getSessionNameSuffix('123e4567-e89b-12d3-a456-426614174000')).toBe(
      '123e4',
    );
  });

  it('normalizes suffix with padding', () => {
    expect(normalizeSessionNameSuffix('ab')).toBe('ab000');
  });

  it('builds full name with immutable suffix', () => {
    expect(buildSessionName('Fix auth flow', 'abc12')).toBe(
      'fix-auth-flow-abc12',
    );
  });

  it('formats default session base from timestamp', () => {
    const base = getDefaultSessionNameBase(new Date('2026-02-13T12:34:56Z'));
    expect(base).toBe('session-20260213-123456');
  });

  it('generates normalized name from model output', async () => {
    const baseLlmClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Fix API auth bug' }] } }],
      }),
    } as unknown as BaseLlmClient;

    const generated = await generateSessionNameBase({
      baseLlmClient,
      firstUserRequest: 'Please help fix our API authentication bug',
    });

    expect(generated).toBe('fix-api-auth-bug');
  });

  it('returns null when model output is empty', async () => {
    const baseLlmClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '   ' }] } }],
      }),
    } as unknown as BaseLlmClient;

    const generated = await generateSessionNameBase({
      baseLlmClient,
      firstUserRequest: 'name this',
    });

    expect(generated).toBeNull();
  });
});

