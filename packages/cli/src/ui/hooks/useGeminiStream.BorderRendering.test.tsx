/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act } from 'react';
import { useGeminiStream } from './useGeminiStream.js';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import {
  CoreToolCallStatus,
  Kind,
  type Config,
  type AnyToolInvocation,
} from '@google/gemini-cli-core';
import type {
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedExecutingToolCall,
} from './useToolScheduler.js';
import type { LoadedSettings } from '../../config/settings.js';

// Mock useToolScheduler
const mockScheduleToolCalls = vi.fn();
const mockCancelAllToolCalls = vi.fn();
const mockMarkToolsAsSubmitted = vi.fn();

vi.mock('./useToolScheduler.js', () => ({
  useToolScheduler: vi.fn(),
}));

// Mock other hooks
vi.mock('./useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(() => false),
}));

describe('useGeminiStream Border Logic', () => {
  let mockAddItem = vi.fn();
  const mockConfig = {
    getApprovalMode: vi.fn(() => 'AUTO_EDIT'),
    getGeminiClient: vi.fn(() => ({
      getChat: vi.fn(() => ({
        recordCompletedToolCalls: vi.fn(),
      })),
      getCurrentSequenceModel: vi.fn(),
    })),
    getModel: vi.fn(() => 'gemini-2.0-flash'),
    getProjectRoot: vi.fn(),
    getCheckpointingEnabled: vi.fn(() => false),
    getContentGeneratorConfig: vi.fn(() => ({ authType: 'none' })),
    storage: {},
  } as unknown as Config;

  const mockLoadedSettings = {
    merged: {
      ui: {
        compactToolOutput: true,
      },
    },
  } as LoadedSettings;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAddItem = vi.fn();
    const { useToolScheduler } = await import('./useToolScheduler.js');
    (useToolScheduler as Mock).mockReturnValue([
      [],
      mockScheduleToolCalls,
      mockMarkToolsAsSubmitted,
      vi.fn(),
      mockCancelAllToolCalls,
      0,
    ]);
  });

  it('should maintain borderTop when standard tools are pushed in separate batches (Fixes #24513)', async () => {
    let currentToolCalls: TrackedToolCall[] = [];

    const { useToolScheduler } = await import('./useToolScheduler.js');
    (useToolScheduler as Mock).mockImplementation(() => [
      currentToolCalls,
      mockScheduleToolCalls,
      mockMarkToolsAsSubmitted,
      vi.fn(),
      mockCancelAllToolCalls,
      0,
    ]);

    const tool1: TrackedToolCall = {
      request: {
        callId: 'call1',
        name: 'shell',
        args: {},
        prompt_id: 'p1',
        isClientInitiated: false,
      },
      status: CoreToolCallStatus.Success,
      response: {
        callId: 'call1',
        responseParts: [],
        resultDisplay: 'out1',
        error: undefined,
        errorType: undefined,
      },
      tool: { kind: Kind.Execute, displayName: 'shell' },
      invocation: { getDescription: () => 'desc1' } as AnyToolInvocation,
      responseSubmittedToGemini: false,
    } as unknown as TrackedCompletedToolCall;

    const tool2Executing: TrackedToolCall = {
      request: {
        callId: 'call2',
        name: 'shell',
        args: {},
        prompt_id: 'p1',
        isClientInitiated: false,
      },
      status: CoreToolCallStatus.Executing,
      tool: { kind: Kind.Execute, displayName: 'shell' },
      invocation: { getDescription: () => 'desc2' } as AnyToolInvocation,
    } as unknown as TrackedExecutingToolCall;

    const tool2Success: TrackedToolCall = {
      ...tool2Executing,
      status: CoreToolCallStatus.Success,
      response: {
        callId: 'call2',
        responseParts: [],
        resultDisplay: 'out2',
        error: undefined,
        errorType: undefined,
      },
      responseSubmittedToGemini: false,
    } as unknown as TrackedCompletedToolCall;

    currentToolCalls = [tool1, tool2Executing];

    const { result, rerender } = await renderHookWithProviders(() =>
      useGeminiStream(
        mockConfig.getGeminiClient(),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        vi.fn(),
        vi.fn().mockResolvedValue(false),
        false,
        () => undefined,
        vi.fn(),
        vi.fn(),
        false,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        80,
        24,
      ),
    );

    // Initial render should push Tool 1 (since it's success)
    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledTimes(1);
    });

    // Check pending items - Tool 2 is executing
    expect(result.current.pendingHistoryItems.length).toBeGreaterThan(0);
    const pendingItem = result.current.pendingHistoryItems.find(
      (i) => i.type === 'tool_group',
    );
    expect(pendingItem).toBeDefined();
    // This is expected to FAIL currently (it will be false)
    expect(pendingItem?.borderTop).toBe(true);

    // Now Tool 2 completes
    currentToolCalls = [tool1, tool2Success];
    await act(async () => {
      rerender();
    });

    // Second push for Tool 2
    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledTimes(2);
    });

    const call1Item = mockAddItem.mock.calls[0][0];
    const call2Item = mockAddItem.mock.calls[1][0];

    // Both should have borderTop: true because they were pushed in separate history items
    expect(call1Item.borderTop).toBe(true);
    expect(call2Item.borderTop).toBe(true);
  });
});
