/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useBtwSessions } from './useBtwSessions.js';
import type { Config } from '@google/gemini-cli-core';

const { mockCreateBtwAgentSession } = vi.hoisted(() => ({
  mockCreateBtwAgentSession: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    createBtwAgentSession: mockCreateBtwAgentSession,
  };
});

describe('useBtwSessions', () => {
  const mockAddItem = vi.fn();
  const mockConfig = {} as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams a distinct btw history item and keeps it pending while active', async () => {
    mockCreateBtwAgentSession.mockResolvedValue({
      abort: vi.fn(),
      sendStream: () =>
        (async function* () {
          yield {
            id: 'btw-1',
            timestamp: '2026-01-01T00:00:00.000Z',
            streamId: 'btw-stream',
            type: 'agent_start',
          };
          yield {
            id: 'btw-2',
            timestamp: '2026-01-01T00:00:00.000Z',
            streamId: 'btw-stream',
            type: 'message',
            role: 'agent',
            content: [{ type: 'text', text: 'Side answer' }],
          };
          yield {
            id: 'btw-3',
            timestamp: '2026-01-01T00:00:00.000Z',
            streamId: 'btw-stream',
            type: 'agent_end',
            reason: 'completed',
          };
        })(),
    });

    const { result } = await renderHookWithProviders(() =>
      useBtwSessions(mockConfig, mockAddItem),
    );

    await act(async () => {
      await result.current.startBtwSession('What changed?');
    });

    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'btw',
          prompt: 'What changed?',
          text: 'Side answer',
        }),
        expect.any(Number),
      );
    });
  });

  it('surfaces startup failures to the UI', async () => {
    mockCreateBtwAgentSession.mockRejectedValue(new Error('boom'));

    const { result } = await renderHookWithProviders(() =>
      useBtwSessions(mockConfig, mockAddItem),
    );

    await act(async () => {
      await result.current.startBtwSession('What changed?');
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: 'error',
        text: 'Failed to start /btw: boom',
      },
      expect.any(Number),
    );
  });
});
