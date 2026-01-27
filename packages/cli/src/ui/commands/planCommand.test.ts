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
  existsSync: vi.fn(),
  promises: {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
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

  it('should show error if plan mode is not enabled', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(
      false,
    );

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Plan mode is experimental'),
    );
    expect(mockContext.services.config!.setApprovalMode).not.toHaveBeenCalled();
  });

  it('should switch to plan mode if enabled', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(false); // No plans found case

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

  it('should show "No plans found" if directory does not exist', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'No plans found.',
    );
  });

  it('should show "No plans found" if directory is empty of .md files', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readdir).mockImplementation(
      async () => ['not-a-plan.txt'] as Array<fs.Dirent<Buffer>>,
    );

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'No plans found.',
    );
  });

  it('should find and display the latest plan', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readdir).mockImplementation(
      async () => ['old-plan.md', 'new-plan.md'] as Array<fs.Dirent<Buffer>>,
    );

    vi.mocked(fs.promises.stat).mockImplementation(async (filePath) => {
      const pathStr = filePath as string;
      if (pathStr.includes('old-plan.md')) {
        return { mtimeMs: 1000 } as fs.Stats;
      }
      if (pathStr.includes('new-plan.md')) {
        return { mtimeMs: 2000 } as fs.Stats;
      }
      return {} as fs.Stats;
    });

    vi.mocked(fs.promises.readFile).mockResolvedValue('# New Plan Content');

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(fs.promises.readFile).toHaveBeenCalledWith(
      '/mock/plans/dir/new-plan.md',
      'utf-8',
    );
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'Latest Plan: new-plan.md',
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.GEMINI,
      text: '# New Plan Content',
    });
  });

  it('should handle errors when reading plans', async () => {
    vi.mocked(mockContext.services.config!.isPlanEnabled).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readdir).mockRejectedValue(new Error('Read error'));

    if (!planCommand.action) throw new Error('Action missing');
    await planCommand.action(mockContext, '');

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Failed to read plans: Error: Read error'),
      expect.any(Error),
    );
  });
});
