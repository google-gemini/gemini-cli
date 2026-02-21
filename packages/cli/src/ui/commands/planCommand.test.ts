/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { planCommand } from './planCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import {
  ApprovalMode,
  coreEvents,
  processSingleFileContent,
  type ProcessedFileReadResult,
} from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: {
      emitFeedback: vi.fn(),
    },
    processSingleFileContent: vi.fn(),
    partToString: vi.fn((val) => val),
  };
});

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    default: { ...actual },
    join: vi.fn((...args) => args.join('/')),
  };
});

describe('planCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          isPlanEnabled: vi.fn(),
          setApprovalMode: vi.fn(),
          getApprovedPlanPath: vi.fn(),
          getApprovalMode: vi.fn(),
          getFileSystemService: vi.fn(),
          storage: {
            getPlansDir: vi.fn().mockReturnValue('/mock/plans/dir'),
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(planCommand.name).toBe('plan');
    expect(planCommand.description).toBe(
      'Switch to Plan Mode and view current plan',
    );
  });

  it('should switch to plan mode if enabled', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(mockContext.services.config!.getApprovedPlanPath).mockReturnValue(
      undefined,
    );

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(mockContext.services.config!.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.PLAN,
    );
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'Switched to Plan Mode.',
    );
  });

  it('should display the approved plan from config', async () => {
    const mockPlanPath = '/mock/plans/dir/approved-plan.md';
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(mockContext.services.config!.getApprovedPlanPath).mockReturnValue(
      mockPlanPath,
    );
    vi.mocked(processSingleFileContent).mockResolvedValue({
      llmContent: '# Approved Plan Content',
      returnDisplay: '# Approved Plan Content',
    } as ProcessedFileReadResult);

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'Approved Plan: approved-plan.md',
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.GEMINI,
      text: '# Approved Plan Content',
    });
  });
});
