/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isFunctionResponse } from './messageInspectors.js';

describe('messageInspectors', () => {
  describe('isFunctionResponse', () => {
    it('should return false for empty user parts', () => {
      expect(isFunctionResponse({ role: 'user', parts: [] })).toBe(false);
    });

    it('should return true when every user part is a function response', () => {
      expect(
        isFunctionResponse({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'read_file',
                response: { output: 'done' },
              },
            },
          ],
        }),
      ).toBe(true);
    });

    it('should return false for mixed user parts', () => {
      expect(
        isFunctionResponse({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'read_file',
                response: { output: 'done' },
              },
            },
            { text: 'Explain this result.' },
          ],
        }),
      ).toBe(false);
    });
  });
});
