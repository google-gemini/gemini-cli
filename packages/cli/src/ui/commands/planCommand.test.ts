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
import { ApprovalMode, coreEvents } from '@google/gemini-cli-core';
import * as fs from 'node:fs';

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

vi.mock('node:fs', () => ({
  promises: {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
  },
  constants: {
    F_OK: 0,
  },
}));

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
          storage: {
            getProjectTempPlansDir: vi.fn().mockReturnValue('/mock/plans/dir'),
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

  it('should show "No active plan found" if no active plan path in config', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(mockContext.services.config!.getApprovedPlanPath).mockReturnValue(
      undefined,
    );

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      'No active plan found. Please create and approve a plan first.',
    );
  });

  it('should display the active plan from config', async () => {
    const mockPlanPath = '/mock/plans/dir/active-plan.md';
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(mockContext.services.config!.getApprovedPlanPath).mockReturnValue(
      mockPlanPath,
    );
    vi.mocked(fs.promises.readFile).mockResolvedValue('# Active Plan Content');

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(fs.promises.readFile).toHaveBeenCalledWith(mockPlanPath, 'utf-8');
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'Active Plan: active-plan.md',
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.GEMINI,
      text: '# Active Plan Content',
    });
  });

  it('should handle errors when reading the active plan', async () => {
    const mockPlanPath = '/mock/plans/dir/active-plan.md';
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(mockContext.services.config!.getApprovedPlanPath).mockReturnValue(
      mockPlanPath,
    );
    vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('Read error'));

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      expect.stringContaining(`Failed to read active plan at ${mockPlanPath}`),
      expect.any(Error),
    );
  });
});
