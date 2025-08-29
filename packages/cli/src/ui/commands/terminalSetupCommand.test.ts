/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { terminalSetupCommand } from './terminalSetupCommand.js';
import * as terminalSetupModule from '../utils/terminalSetup.js';
import type { CommandContext } from './types.js';

vi.mock('../utils/terminalSetup.js');

describe('terminalSetupCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    expect(terminalSetupCommand.name).toBe('terminal-setup');
    expect(terminalSetupCommand.description).toContain('multiline input');
    expect(terminalSetupCommand.kind).toBe('built-in');
  });

  it('should return success message when terminal setup succeeds', async () => {
    vi.spyOn(terminalSetupModule, 'terminalSetup').mockResolvedValue({
      success: true,
      message: 'Terminal configured successfully',
    });

    const result = await terminalSetupCommand.action({} as CommandContext, '');

    expect(result).toEqual({
      type: 'message',
      content: 'Terminal configured successfully',
      messageType: 'info',
    });
  });

  it('should append restart message when terminal setup requires restart', async () => {
    vi.spyOn(terminalSetupModule, 'terminalSetup').mockResolvedValue({
      success: true,
      message: 'Terminal configured successfully',
      requiresRestart: true,
    });

    const result = await terminalSetupCommand.action({} as CommandContext, '');

    expect(result).toEqual({
      type: 'message',
      content:
        'Terminal configured successfully\n\nPlease restart your terminal for the changes to take effect.',
      messageType: 'info',
    });
  });

  it('should return error message when terminal setup fails', async () => {
    vi.spyOn(terminalSetupModule, 'terminalSetup').mockResolvedValue({
      success: false,
      message: 'Failed to detect terminal',
    });

    const result = await terminalSetupCommand.action({} as CommandContext, '');

    expect(result).toEqual({
      type: 'message',
      content: 'Failed to detect terminal',
      messageType: 'error',
    });
  });

  it('should handle exceptions from terminal setup', async () => {
    vi.spyOn(terminalSetupModule, 'terminalSetup').mockRejectedValue(
      new Error('Unexpected error'),
    );

    const result = await terminalSetupCommand.action({} as CommandContext, '');

    expect(result).toEqual({
      type: 'message',
      content: 'Failed to configure terminal: Error: Unexpected error',
      messageType: 'error',
    });
  });
});
