/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { copyCommand } from './copyCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { copyToClipboard } from '../utils/commandUtils.js';

vi.mock('../utils/commandUtils.js', () => ({
  copyToClipboard: vi.fn(),
}));

describe('copyCommand', () => {
  let mockContext: CommandContext;
  let mockCopyToClipboard: Mock;
  let mockGetLastOutput: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCopyToClipboard = vi.mocked(copyToClipboard);
    mockGetLastOutput = vi.fn().mockReturnValue(undefined);

    mockContext = createMockCommandContext({
      ui: {
        getLastOutput: mockGetLastOutput,
      },
    });
  });

  it('should return info message when no output is available', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetLastOutput.mockReturnValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should copy last AI message to clipboard successfully', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetLastOutput.mockReturnValue({
      type: 'ai',
      content: 'Hi there! How can I help you?',
      timestamp: 1000,
    });
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'Hi there! How can I help you?',
      expect.anything(),
    );
  });

  it('should copy last slash command output to clipboard successfully', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetLastOutput.mockReturnValue({
      type: 'slash',
      content: 'Slash command output',
      timestamp: 2000,
    });
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'Slash command output',
      expect.anything(),
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });
  });

  it('should copy whatever getLastOutput returns (most recent wins)', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    // Case 1: AI is more recent
    mockGetLastOutput.mockReturnValue({
      type: 'ai',
      content: 'More recent AI response',
      timestamp: 3000,
    });
    await copyCommand.action(mockContext, '');
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'More recent AI response',
      expect.anything(),
    );

    // Case 2: Slash is more recent
    mockGetLastOutput.mockReturnValue({
      type: 'slash',
      content: 'More recent slash output',
      timestamp: 4000,
    });
    await copyCommand.action(mockContext, '');
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'More recent slash output',
      expect.anything(),
    );
  });

  it('should handle clipboard errors gracefully', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetLastOutput.mockReturnValue({
      type: 'ai',
      content: 'Some text',
      timestamp: 1000,
    });
    mockCopyToClipboard.mockRejectedValue(new Error('Clipboard access denied'));

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to copy to the clipboard. Clipboard access denied',
    });
  });
});
