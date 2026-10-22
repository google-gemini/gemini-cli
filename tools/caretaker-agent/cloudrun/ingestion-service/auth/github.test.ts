/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { verifyGithubSignature } from './github.js';
import * as crypto from 'node:crypto';

describe('verifyGithubSignature', () => {
  const secret = 'my-secret';
  const payload = '{"test":true}';

  it('should return true for a valid signature', () => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const validSignature = 'sha256=' + hmac.digest('hex');

    const result = verifyGithubSignature(payload, validSignature, secret);
    expect(result).toBe(true);
  });

  it('should return false if signatureHeader is missing', () => {
    const result = verifyGithubSignature(payload, undefined, secret);
    expect(result).toBe(false);
  });

  it('should return false for an invalid signature', () => {
    const result = verifyGithubSignature(
      payload,
      'sha256=invalid-signature',
      secret,
    );
    expect(result).toBe(false);
  });
});
