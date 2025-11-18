/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { sessionId } from './session.js';

describe('sessionId', () => {
  it('should be a non-empty string', () => {
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('should match UUID v4 format', () => {
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(sessionId).toMatch(uuidV4Regex);
  });

  it('should be the same value across multiple imports', async () => {
    const { sessionId: importedAgain } = await import('./session.js');
    expect(importedAgain).toBe(sessionId);
  });

  it('should contain hyphens in correct positions', () => {
    const parts = sessionId.split('-');
    expect(parts).toHaveLength(5);
    expect(parts[0].length).toBe(8);
    expect(parts[1].length).toBe(4);
    expect(parts[2].length).toBe(4);
    expect(parts[3].length).toBe(4);
    expect(parts[4].length).toBe(12);
  });

  it('should have version 4 indicator', () => {
    const parts = sessionId.split('-');
    expect(parts[2][0]).toBe('4');
  });
});
