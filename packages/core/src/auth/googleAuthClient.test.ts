/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, vi } from 'vitest';
import { GoogleAuthClient } from './googleAuthClient.js';
import { GoogleAuth } from 'google-auth-library';

vi.mock('google-auth-library');

describe('GoogleAuthClient', () => {
  it('should return the correct headers', async () => {
    const mockGetClient = vi.fn().mockResolvedValue({
      getRequestHeaders: vi
        .fn()
        .mockResolvedValue({ Authorization: 'Bearer test-token' }),
    });
    vi.mocked(GoogleAuth).mockReturnValue({
      getClient: mockGetClient,
    } as unknown as GoogleAuth);

    const client = new GoogleAuthClient();
    const headers = await client.getHeaders();

    expect(GoogleAuth).toHaveBeenCalledWith({
      scopes: 'https://www.googleapis.com/auth/userinfo.email',
    });
    expect(mockGetClient).toHaveBeenCalledTimes(1);
    expect(headers).toEqual({ Authorization: 'Bearer test-token' });
  });
});
