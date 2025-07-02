/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { createCodeAssistContentGenerator } from './codeAssist.js';
import { AuthType } from '../core/contentGenerator.js';
import { UnsupportedAuthTypeError } from './errors.js';

vi.mock('./oauth2.js', () => ({
  getOauthClient: vi.fn(),
}));

vi.mock('./setup.js', () => ({
  setupUser: vi.fn(),
}));

vi.mock('./server.js', () => ({
  CodeAssistServer: vi.fn(),
}));

describe('codeAssist', () => {
  it('should throw an error for unsupported auth types', async () => {
    await expect(
      createCodeAssistContentGenerator({}, 'unsupported' as AuthType),
    ).rejects.toThrow(new UnsupportedAuthTypeError('unsupported'));
  });
});
