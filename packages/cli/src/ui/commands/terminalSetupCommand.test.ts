/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { terminalSetupCommand } from './terminalSetupCommand.js';
import { terminalSetup } from '../utils/terminalSetup.js';
import { MessageActionReturn, CommandContext, CommandKind } from './types.js';

// Mock the terminalSetup function
vi.mock('../utils/terminalSetup.js', () => ({
  terminalSetup: vi.fn(),
}));

describe('terminalSetupCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    expect(terminalSetupCommand.name).toBe('terminal-setup');
    expect(terminalSetupCommand.description).toContain(
      'Configure terminal keybindings',
    );
    expect(terminalSetupCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(terminalSetupCommand.action).toBeDefined();
  });

  it('should return success message when terminal setup succeeds', async () => {
    const mockResult = {
      success: true,
      message: 'VS Code keybindings already configured.',
      requiresRestart: false,
    };
    vi.mocked(terminalSetup).mockResolvedValue(mockResult);

    const result = await terminalSetupCommand.action!({} as CommandContext);

    expect(result).toEqual<MessageActionReturn>({
      type: 'message',
      content: mockResult.message,
      messageType: 'info',
    });
    expect(terminalSetup).toHaveBeenCalledOnce();
  });

  it('should return success message with restart required', async () => {
    const mockResult = {
      success: true,
      message:
        'Added Shift+Enter and Ctrl+Enter keybindings to VS Code.\nModified: /path/to/keybindings.json',
      requiresRestart: true,
    };
    vi.mocked(terminalSetup).mockResolvedValue(mockResult);

    const result = await terminalSetupCommand.action!({} as CommandContext);

    expect(result).toEqual<MessageActionReturn>({
      type: 'message',
      content:
        mockResult.message +
        '\n\nPlease restart your terminal for the changes to take effect.',
      messageType: 'info',
    });
  });

  it('should return error message when terminal setup fails', async () => {
    const mockResult = {
      success: false,
      message:
        'Could not detect terminal type. Supported terminals: VS Code, Cursor, and Windsurf.',
    };
    vi.mocked(terminalSetup).mockResolvedValue(mockResult);

    const result = await terminalSetupCommand.action!({} as CommandContext);

    expect(result).toEqual<MessageActionReturn>({
      type: 'message',
      content: mockResult.message,
      messageType: 'error',
    });
  });

  it('should return error message when existing keybindings detected', async () => {
    const mockResult = {
      success: false,
      message: `Existing keybindings detected. Will not modify to avoid conflicts.
- Shift+Enter binding already exists
Please check and modify manually if needed: /path/to/keybindings.json`,
    };
    vi.mocked(terminalSetup).mockResolvedValue(mockResult);

    const result = await terminalSetupCommand.action!({} as CommandContext);

    expect(result).toEqual<MessageActionReturn>({
      type: 'message',
      content: mockResult.message,
      messageType: 'error',
    });
  });

  it('should handle exceptions from terminalSetup', async () => {
    const error = new Error('Unexpected error');
    vi.mocked(terminalSetup).mockRejectedValue(error);

    const result = await terminalSetupCommand.action!({} as CommandContext);

    expect(result).toEqual<MessageActionReturn>({
      type: 'message',
      content: 'Failed to configure terminal: Error: Unexpected error',
      messageType: 'error',
    });
  });
});
