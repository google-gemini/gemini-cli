/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGeminiClient } from './utilities.js';
import { Config } from '../../config/config.js';
import { AuthType } from '../../core/contentGenerator.js';
import { GeminiClient } from '../../core/client.js';

vi.mock('../../config/config.js');
vi.mock('../../core/client.js');

describe('utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getGeminiClient should initialize config and return client with default model', async () => {
    const mockConfigInstance = {
      initialize: vi.fn(),
      refreshAuth: vi.fn(),
    };
    (Config as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockConfigInstance,
    );

    const client = await getGeminiClient();

    expect(Config).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'temp-conseca-session',
        model: 'gemini-2.5-flash-lite',
        modelConfigServiceConfig: expect.objectContaining({
          overrides: expect.arrayContaining([
            expect.objectContaining({
              match: { model: 'gemini-2.5-flash-lite' },
              modelConfig: {
                generateContentConfig: {
                  responseMimeType: 'application/json',
                },
              },
            }),
          ]),
        }),
      }),
    );
    expect(mockConfigInstance.initialize).toHaveBeenCalled();
    expect(mockConfigInstance.refreshAuth).toHaveBeenCalledWith(
      AuthType.USE_GEMINI,
    );
    expect(GeminiClient).toHaveBeenCalledWith(mockConfigInstance);
    expect(client).toBeInstanceOf(GeminiClient);
  });

  it('getGeminiClient should accept custom model', async () => {
    const mockConfigInstance = {
      initialize: vi.fn(),
      refreshAuth: vi.fn(),
    };
    (Config as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockConfigInstance,
    );

    const customModel = 'gemini-2.5-pro';
    await getGeminiClient(customModel);

    expect(Config).toHaveBeenCalledWith(
      expect.objectContaining({
        model: customModel,
        modelConfigServiceConfig: expect.objectContaining({
          overrides: expect.arrayContaining([
            expect.objectContaining({
              match: { model: customModel },
            }),
          ]),
        }),
      }),
    );
  });
});
