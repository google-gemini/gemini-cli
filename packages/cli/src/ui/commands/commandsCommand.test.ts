/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commandsCommand } from './commandsCommand.js';
import { MessageType } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';

describe('commandsCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = createMockCommandContext({
      ui: {
        reloadCommands: vi.fn(),
      },
    });
  });

  describe('default action', () => {
    it('should return an info message prompting subcommand usage', async () => {
      const result = await commandsCommand.action!(context, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'Use "/commands reload" to reload custom command definitions from .toml files.',
      });
    });
  });

  describe('reload', () => {
    it('should call reloadCommands and show a success message', async () => {
      const reloadCmd = commandsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;

      await reloadCmd.action!(context, '');

      expect(context.ui.reloadCommands).toHaveBeenCalledTimes(1);
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Custom commands reloaded successfully.',
        }),
        expect.any(Number),
      );
    });
  });
});
