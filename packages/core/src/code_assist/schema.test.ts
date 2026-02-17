/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { LoadCodeAssistResponseSchema } from './types.js';

describe('LoadCodeAssistResponseSchema', () => {
  it('should allow missing showNotice in privacyNotice and default to false', () => {
    const data = {
      currentTier: {
        id: 'standard-tier',
        privacyNotice: {
          noticeText: 'Some notice',
        },
      },
      allowedTiers: [
        {
          id: 'free-tier',
          privacyNotice: {},
        },
        {
          id: 'standard-tier',
          privacyNotice: {
            showNotice: true,
          },
        },
      ],
    };

    const parsed = LoadCodeAssistResponseSchema.parse(data);

    expect(parsed.currentTier?.privacyNotice?.showNotice).toBe(false);
    expect(parsed.allowedTiers?.[0].privacyNotice?.showNotice).toBe(false);
    expect(parsed.allowedTiers?.[1].privacyNotice?.showNotice).toBe(true);
  });

  it('should allow missing privacyNotice altogether', () => {
    const data = {
      currentTier: {
        id: 'standard-tier',
      },
    };

    const parsed = LoadCodeAssistResponseSchema.parse(data);

    expect(parsed.currentTier?.privacyNotice).toBeUndefined();
  });
});
