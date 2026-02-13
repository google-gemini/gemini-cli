/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deepworkCommand } from './deepworkCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { ApprovalMode, coreEvents } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: {
      emitFeedback: vi.fn(),
    },
  };
});

describe('deepworkCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          isDeepWorkEnabled: vi.fn(),
          setApprovalMode: vi.fn(),
          getApprovalMode: vi.fn(),
          getApprovedPlanPath: vi.fn(),
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);

    vi.clearAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(deepworkCommand.name).toBe('deepwork');
    expect(deepworkCommand.description).toBe(
      'Switch to Deep Work mode for iterative execution',
    );
  });

  it('should switch to deep work mode when enabled', async () => {
    vi.mocked(mockContext.services.config!.isDeepWorkEnabled).mockReturnValue(
      true,
    );
    vi.mocked(mockContext.services.config!.getApprovalMode).mockReturnValue(
      ApprovalMode.DEFAULT,
    );
    vi.mocked(mockContext.services.config!.getApprovedPlanPath).mockReturnValue(
      undefined,
    );

    if (!deepworkCommand.action) throw new Error('Action missing');
    await deepworkCommand.action(mockContext, '');

    expect(mockContext.services.config!.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.DEEP_WORK,
    );
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'Switched to Deep Work mode.',
    );
  });

  it('should emit error when deep work mode is disabled', async () => {
    vi.mocked(mockContext.services.config!.isDeepWorkEnabled).mockReturnValue(
      false,
    );

    if (!deepworkCommand.action) throw new Error('Action missing');
    await deepworkCommand.action(mockContext, '');

    expect(mockContext.services.config!.setApprovalMode).not.toHaveBeenCalled();
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      'Deep Work mode is disabled. Enable experimental.deepWork in settings first.',
    );
  });
});
