/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  updateAllUpdatableExtensions,
  updateExtensionByName,
} from '../../config/extension.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { extensionsCommand } from './extensionsCommand.js';
import { type CommandContext } from './types.js';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';

vi.mock('../../config/extension.js', () => ({
  updateExtensionByName: vi.fn(),
  updateAllUpdatableExtensions: vi.fn(),
}));

const mockUpdateExtensionByName = updateExtensionByName as MockedFunction<
  typeof updateExtensionByName
>;

const mockUpdateAllUpdatableExtensions =
  updateAllUpdatableExtensions as MockedFunction<
    typeof updateAllUpdatableExtensions
  >;

describe('extensionsCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockContext = createMockCommandContext({
      services: {
        config: {
          getExtensions: () => [],
        },
      },
    });
  });

  describe('list', () => {
    it('should display "No active extensions." when none are found', async () => {
      if (!extensionsCommand.action) throw new Error('Action not defined');
      await extensionsCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'No active extensions.',
        },
        expect.any(Number),
      );
    });

    it('should list active extensions when they are found', async () => {
      const mockExtensions = [
        { name: 'ext-one', version: '1.0.0', isActive: true },
        { name: 'ext-two', version: '2.1.0', isActive: true },
        { name: 'ext-three', version: '3.0.0', isActive: false },
      ];
      mockContext = createMockCommandContext({
        services: {
          config: {
            getExtensions: () => mockExtensions,
          },
        },
      });

      if (!extensionsCommand.action) throw new Error('Action not defined');
      await extensionsCommand.action(mockContext, '');

      const expectedMessage =
        'Active extensions:\n\n' +
        `  - \u001b[36mext-one (v1.0.0)\u001b[0m\n` +
        `  - \u001b[36mext-two (v2.1.0)\u001b[0m\n`;

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: expectedMessage,
        },
        expect.any(Number),
      );
    });
  });

  describe('update', () => {
    const updateAction = extensionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'update',
    )?.action;

    if (!updateAction) {
      throw new Error('Update action not found');
    }

    it('should show usage if no args are provided', async () => {
      await updateAction(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Usage: /extensions update <extension-names>|--all',
        },
        expect.any(Number),
      );
    });

    it('should inform user if there are no extensions to update with --all', async () => {
      mockUpdateAllUpdatableExtensions.mockResolvedValue([]);
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'No extensions to update.',
        },
        expect.any(Number),
      );
    });

    it('should update all extensions with --all', async () => {
      mockUpdateAllUpdatableExtensions.mockResolvedValue([
        {
          name: 'ext-one',
          originalVersion: '1.0.0',
          updatedVersion: '1.0.1',
        },
        {
          name: 'ext-two',
          originalVersion: '2.0.0',
          updatedVersion: '2.0.1',
        },
      ]);
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text:
            'Extension "ext-one" successfully updated: 1.0.0 → 1.0.1.\n' +
            'Extension "ext-two" successfully updated: 2.0.0 → 2.0.1.\n' +
            'Restart gemini-cli to see the changes.',
        },
        expect.any(Number),
      );
    });

    it('should handle errors when updating all extensions', async () => {
      mockUpdateAllUpdatableExtensions.mockRejectedValue(
        new Error('Something went wrong'),
      );
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Something went wrong',
        },
        expect.any(Number),
      );
    });

    it('should update a single extension by name', async () => {
      mockUpdateExtensionByName.mockResolvedValue({
        name: 'ext-one',
        originalVersion: '1.0.0',
        updatedVersion: '1.0.1',
      });
      await updateAction(mockContext, 'ext-one');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text:
            'Extension "ext-one" successfully updated: 1.0.0 → 1.0.1.\n' +
            'Restart gemini-cli to see the changes.',
        },
        expect.any(Number),
      );
    });

    it('should handle errors when updating a single extension', async () => {
      mockUpdateExtensionByName.mockRejectedValue(
        new Error('Extension not found'),
      );
      await updateAction(mockContext, 'ext-one');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Extension not found',
        },
        expect.any(Number),
      );
    });

    it('should update multiple extensions by name', async () => {
      mockUpdateExtensionByName
        .mockResolvedValueOnce({
          name: 'ext-one',
          originalVersion: '1.0.0',
          updatedVersion: '1.0.1',
        })
        .mockResolvedValueOnce({
          name: 'ext-two',
          originalVersion: '2.0.0',
          updatedVersion: '2.0.1',
        });
      await updateAction(mockContext, 'ext-one ext-two');
      expect(mockUpdateExtensionByName).toHaveBeenCalledTimes(2);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text:
            'Extension "ext-one" successfully updated: 1.0.0 → 1.0.1.\n' +
            'Extension "ext-two" successfully updated: 2.0.0 → 2.0.1.\n' +
            'Restart gemini-cli to see the changes.',
        },
        expect.any(Number),
      );
    });
  });
});
