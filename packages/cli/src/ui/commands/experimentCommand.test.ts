/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimentCommand } from './experimentCommand.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { SettingScope } from '../../config/settings.js';

describe('experimentCommand', () => {
  let mockContext: {
    services: {
      config: {
        getExperimentValue: vi.Mock;
      };
      settings: {
        merged: {
          experimental: Record<string, unknown>;
        };
        setValue: vi.Mock;
      };
    };
    ui: {
      addItem: vi.Mock;
    };
  };

  beforeEach(() => {
    mockContext = {
      services: {
        config: {
          getExperimentValue: vi.fn(),
        },
        settings: {
          merged: {
            experimental: {},
          },
          setValue: vi.fn(),
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    };
  });

  it('should have the correct name and description', () => {
    expect(experimentCommand.name).toBe('experiment');
    expect(experimentCommand.description).toBe('Manage experimental features');
    expect(experimentCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  describe('list sub-command', () => {
    const listCommand = experimentCommand.subCommands?.find(
      (c) => c.name === 'list',
    );

    it('should list experiments', async () => {
      mockContext.services.config.getExperimentValue.mockReturnValue(true);
      await listCommand?.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('enable-preview'),
        }),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Value: true'),
        }),
      );
    });
  });

  describe('set sub-command', () => {
    const setCommand = experimentCommand.subCommands?.find(
      (c) => c.name === 'set',
    );

    it('should set a boolean experiment', async () => {
      await setCommand?.action!(mockContext, 'enable-preview true');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'experimental',
        expect.objectContaining({
          'enable-preview': true,
        }),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining(
            'Experiment enable-preview set to true',
          ),
        }),
      );
    });

    it('should set a number experiment', async () => {
      await setCommand?.action!(mockContext, 'classifier-threshold 0.5');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'experimental',
        expect.objectContaining({
          'classifier-threshold': 0.5,
        }),
      );
    });

    it('should show error for unknown experiment', async () => {
      await setCommand?.action!(mockContext, 'unknown-exp true');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('Unknown experiment: unknown-exp'),
        }),
      );
    });
  });

  describe('unset sub-command', () => {
    const unsetCommand = experimentCommand.subCommands?.find(
      (c) => c.name === 'unset',
    );

    it('should unset an experiment', async () => {
      mockContext.services.settings.merged.experimental = {
        'enable-preview': true,
      };
      await unsetCommand?.action!(mockContext, 'enable-preview');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'experimental',
        {},
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining(
            'Local override for experiment enable-preview removed',
          ),
        }),
      );
    });

    it('should show error if no override exists', async () => {
      await unsetCommand?.action!(mockContext, 'enable-preview');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining(
            'No local override found for experiment: enable-preview',
          ),
        }),
      );
    });
  });
});
