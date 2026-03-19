/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { iapMiddleware } from './iap.js';
import type { Request, Response } from 'express';

describe('iapMiddleware', () => {
  it('should extract user info from IAP headers', () => {
    const req = {
      header: vi.fn((name) => {
        if (name === 'x-goog-authenticated-user-email') return 'accounts.google.com:test@google.com';
        if (name === 'x-goog-authenticated-user-id') return 'accounts.google.com:12345';
        return undefined;
      }),
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    iapMiddleware(req, res, next);

    expect((req as any).user).toEqual({
      id: '12345',
      email: 'test@google.com',
    });
    expect(next).toHaveBeenCalled();
  });

  it('should fall back to dev user if headers missing in non-prod', () => {
    const req = {
        header: vi.fn(() => undefined),
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    iapMiddleware(req, res, next);

    expect((req as any).user.id).toBe('dev-user-id');
    expect(next).toHaveBeenCalled();
  });
});
