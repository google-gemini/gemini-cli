/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateOpenAICredentials } from './openaiCredentialStorage.js';

describe('validateOpenAICredentials', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports when the configured model is absent from the endpoint model list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: 'list',
            data: [{ id: 'gpt-5' }, { id: 'gpt-5.4' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      validateOpenAICredentials({
        baseUrl: 'http://127.0.0.1:8000/v1',
        model: 'gpt-4.1',
      }),
    ).resolves.toBe(
      'Model "gpt-4.1" is not available from this endpoint. Available models include: gpt-5, gpt-5.4.',
    );
  });
});
