/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  nerScanAndRedact,
  _setNerScannerInstance,
} from './ner-pii-scanner.js';

// Inject a mock GlinerInstance directly — avoids the ESM dynamic import path
// entirely so tests run without a real model, network access, or gliner package.
const MOCK_PATTERNS: [string, string][] = [
  ['password', 'hunter2'],
  ['email address', 'alice@example.com'],
  ['ssn', '123-45-6789'],
  ['name', 'John Smith'],
];

beforeAll(() => {
  _setNerScannerInstance({
    initialize: async () => {},
    async inference({
      texts,
      threshold = 0.4,
    }: {
      texts: string[];
      entities: string[];
      threshold?: number;
    }) {
      return texts.map((text: string) => {
        const hits: {
          entity: string;
          value: string;
          score: number;
          start: number;
          end: number;
        }[] = [];
        for (const [entity, value] of MOCK_PATTERNS) {
          const idx = text.indexOf(value);
          if (idx !== -1) {
            hits.push({
              entity,
              value,
              score: 0.9,
              start: idx,
              end: idx + value.length,
            });
          }
        }
        return hits.filter((h) => h.score >= threshold);
      });
    },
  });
});

describe('nerScanAndRedact', () => {
  it('redacts a detected password', async () => {
    const { matches, sanitized } = await nerScanAndRedact(
      'The password is hunter2 — keep it safe.',
    );
    expect(matches.some((m) => m.type === 'ner_password')).toBe(true);
    expect(sanitized).not.toContain('hunter2');
    expect(sanitized).toContain('[REDACTED:ner_password]');
  });

  it('redacts an email address', async () => {
    const { matches, sanitized } = await nerScanAndRedact(
      'Please contact alice@example.com for access.',
    );
    expect(matches.some((m) => m.type === 'ner_email_address')).toBe(true);
    expect(sanitized).not.toContain('alice@example.com');
    expect(sanitized).toContain('[REDACTED:ner_email_address]');
  });

  it('redacts an SSN', async () => {
    const { matches, sanitized } = await nerScanAndRedact(
      'Employee SSN: 123-45-6789.',
    );
    expect(matches.some((m) => m.type === 'ner_ssn')).toBe(true);
    expect(sanitized).not.toContain('123-45-6789');
    expect(sanitized).toContain('[REDACTED:ner_ssn]');
  });

  it('handles multiple PII entities in one string', async () => {
    const { matches, sanitized } = await nerScanAndRedact(
      'Contact John Smith at alice@example.com.',
    );
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(sanitized).not.toContain('John Smith');
    expect(sanitized).not.toContain('alice@example.com');
  });

  it('returns clean result when no PII detected', async () => {
    const text = 'This is a normal log line with no sensitive data.';
    const { matches, sanitized } = await nerScanAndRedact(text);
    expect(matches).toHaveLength(0);
    expect(sanitized).toBe(text);
  });

  it('exposes entity type and original value in SecretMatch', async () => {
    const { matches } = await nerScanAndRedact('password hunter2 here');
    const m = matches.find((m) => m.type === 'ner_password');
    expect(m).toBeDefined();
    expect(m!.value).toBe('hunter2');
    expect(m!.redacted).toBe('[REDACTED:ner_password]');
  });

  it('replaces values by position without corrupting surrounding text', async () => {
    const { sanitized } = await nerScanAndRedact('Before hunter2 after.');
    expect(sanitized).toBe('Before [REDACTED:ner_password] after.');
  });
});
