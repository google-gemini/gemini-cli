/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationsCommand } from './notificationsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { CommandKind, type MessageActionReturn } from './types.js';
import { SettingScope } from '../../config/settings.js';
import { NotificationManager } from '../../notifications/manager.js';

// Mock NotificationManager
vi.mock('../../notifications/manager.js', () => ({
  NotificationManager: vi.fn(),
}));

const mockNotificationManager = vi.mocked(NotificationManager);

describe('notificationsCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;
  let mockManagerInstance: {
    notify: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockManagerInstance = {
      notify: vi.fn().mockResolvedValue({ fallbackUsed: false }),
      dispose: vi.fn(),
      getStatus: vi.fn().mockReturnValue({
        enabled: true,
        events: {
          inputRequired: { enabled: true, sound: 'system' },
          taskComplete: { enabled: false, sound: 'system' },
          idleAlert: { enabled: true, sound: 'system', timeout: 60 },
        },
      }),
    };
    mockNotificationManager.mockImplementation(
      () => mockManagerInstance as unknown as NotificationManager,
    );

    mockContext = createMockCommandContext({
      services: {
        settings: {
          setValue: vi.fn(),
          merged: {
            general: {
              notifications: {
                enabled: true,
                events: {
                  inputRequired: { enabled: true, sound: 'system' },
                  taskComplete: { enabled: false, sound: 'system' },
                  idleAlert: { enabled: true, sound: 'system', timeout: 60 },
                },
              },
            },
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct command properties', () => {
    expect(notificationsCommand.name).toBe('notifications');
    expect(notificationsCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(notificationsCommand.description).toContain('audio notifications');
    expect(notificationsCommand.subCommands).toHaveLength(5);
  });

  describe('main command action', () => {
    it('should show status when no subcommand provided', async () => {
      const result = await notificationsCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notification Status'),
      });
      expect(mockManagerInstance.getStatus).toHaveBeenCalled();
    });

    it('should execute enable subcommand', async () => {
      const result = await notificationsCommand.action!(mockContext, 'enable');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notifications enabled'),
      });
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.enabled',
        true,
      );
    });

    it('should execute disable subcommand', async () => {
      const result = await notificationsCommand.action!(mockContext, 'disable');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('disabled'),
      });
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.enabled',
        false,
      );
    });

    it('should execute status subcommand', async () => {
      const result = await notificationsCommand.action!(mockContext, 'status');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notification Status'),
      });
    });

    it('should execute test subcommand and show options', async () => {
      const result = await notificationsCommand.action!(mockContext, 'test');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Test Notification Options'),
      });
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should execute test subcommand with individual notification type', async () => {
      const result = await notificationsCommand.action!(
        mockContext,
        'test input',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Tested Input Required'),
      });
      expect(mockManagerInstance.notify).toHaveBeenCalledTimes(1);
      expect(mockManagerInstance.notify).toHaveBeenCalledWith('inputRequired');
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should execute setup subcommand', async () => {
      const result = await notificationsCommand.action!(mockContext, 'setup');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notification Setup Wizard'),
      });
    });

    it('should return error for unknown subcommand', async () => {
      const result = await notificationsCommand.action!(mockContext, 'unknown');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Unknown subcommand'),
      });
    });
  });

  describe('enable subcommand', () => {
    it('should enable notifications and set default event configurations', async () => {
      const context = createMockCommandContext({
        services: {
          settings: {
            setValue: vi.fn(),
            merged: {},
          },
        },
      });

      const enableSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      )!;

      const result = await enableSubcommand.action!(context, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notifications enabled'),
      });

      // Should enable notifications
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.enabled',
        true,
      );

      // Should set default event configurations
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.inputRequired.enabled',
        true,
      );
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.inputRequired.sound',
        'system',
      );
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.taskComplete.enabled',
        true,
      );
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.taskComplete.sound',
        'system',
      );
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.idleAlert.enabled',
        true,
      );
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.idleAlert.timeout',
        60,
      );
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.idleAlert.sound',
        'system',
      );

      // Should test the notification
      expect(mockManagerInstance.notify).toHaveBeenCalledWith('inputRequired');
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should not override existing event configurations', async () => {
      const context = createMockCommandContext({
        services: {
          settings: {
            setValue: vi.fn(),
            merged: {
              general: {
                notifications: {
                  enabled: false,
                  events: {
                    inputRequired: {
                      enabled: false,
                      sound: 'custom',
                      customPath: '/custom.wav' as string,
                    },
                    taskComplete: { enabled: true, sound: 'system' },
                    idleAlert: {
                      enabled: false,
                      sound: 'system',
                      timeout: 120,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const enableSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      )!;

      await enableSubcommand.action!(context, '');

      // Should not set inputRequired config since it already exists
      expect(context.services.settings.setValue).not.toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.inputRequired.enabled',
        expect.anything(),
      );
    });
  });

  describe('disable subcommand', () => {
    it('should disable notifications', async () => {
      const disableSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      )!;

      const result = await disableSubcommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('disabled'),
      });
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.enabled',
        false,
      );
    });
  });

  describe('status subcommand', () => {
    it('should show current notification configuration', async () => {
      const statusSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'status',
      )!;

      const result = (await statusSubcommand.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notification Status'),
      });
      expect(result.content).toContain('Enabled: true');
      expect(result.content).toContain('inputRequired');
      expect(result.content).toContain('taskComplete');
      expect(result.content).toContain('idleAlert');
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should format custom sound paths correctly', async () => {
      mockManagerInstance.getStatus.mockReturnValue({
        enabled: true,
        events: {
          inputRequired: {
            enabled: true,
            sound: 'custom',
            customPath: '/custom/sound.wav',
          },
          taskComplete: { enabled: false, sound: 'system' },
          idleAlert: { enabled: true, sound: 'system', timeout: 60 },
        },
      });

      const statusSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'status',
      )!;

      const result = (await statusSubcommand.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(result.content).toContain('custom (/custom/sound.wav)');
    });

    it('should format idleAlert timeout correctly', async () => {
      mockManagerInstance.getStatus.mockReturnValue({
        enabled: true,
        events: {
          inputRequired: { enabled: true, sound: 'system' },
          taskComplete: { enabled: false, sound: 'system' },
          idleAlert: { enabled: true, sound: 'system', timeout: 120 },
        },
      });

      const statusSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'status',
      )!;

      const result = (await statusSubcommand.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(result.content).toContain('timeout: 120s');
    });
  });

  describe('test subcommand', () => {
    it('should show available options when no argument provided', async () => {
      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = (await testSubcommand.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Test Notification Options'),
      });
      expect(result.content).toContain('input');
      expect(result.content).toContain('complete');
      expect(result.content).toContain('idle');
      expect(result.content).toContain('/notifications test input');
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
    });

    it('should test input required notification individually', async () => {
      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = await testSubcommand.action!(mockContext, 'input');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Tested Input Required'),
      });
      expect(mockManagerInstance.notify).toHaveBeenCalledTimes(1);
      expect(mockManagerInstance.notify).toHaveBeenCalledWith('inputRequired');
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should test task complete notification individually', async () => {
      // Enable taskComplete for this test
      const context = createMockCommandContext({
        services: {
          settings: {
            setValue: vi.fn(),
            merged: {
              general: {
                notifications: {
                  enabled: true,
                  events: {
                    inputRequired: { enabled: true, sound: 'system' },
                    taskComplete: { enabled: true, sound: 'system' },
                    idleAlert: { enabled: true, sound: 'system', timeout: 60 },
                  },
                },
              },
            },
          },
        },
      });

      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = await testSubcommand.action!(context, 'complete');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Tested Task Complete'),
      });
      expect(mockManagerInstance.notify).toHaveBeenCalledTimes(1);
      expect(mockManagerInstance.notify).toHaveBeenCalledWith('taskComplete');
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should test idle alert notification individually', async () => {
      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = await testSubcommand.action!(mockContext, 'idle');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Tested Idle Alert'),
      });
      expect(mockManagerInstance.notify).toHaveBeenCalledTimes(1);
      expect(mockManagerInstance.notify).toHaveBeenCalledWith('idleAlert');
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should show fallback message when custom sound file is not found', async () => {
      const context = createMockCommandContext({
        services: {
          settings: {
            setValue: vi.fn(),
            merged: {
              general: {
                notifications: {
                  enabled: true,
                  events: {
                    inputRequired: {
                      enabled: true,
                      sound: 'custom',
                      customPath: '/nonexistent.wav',
                    },
                  },
                },
              },
            },
          },
        },
      });

      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      // Mock notify to return fallback info
      mockManagerInstance.notify.mockResolvedValueOnce({
        fallbackUsed: true,
        fallbackReason: 'Custom sound file not found: /nonexistent.wav',
      });

      const result = (await testSubcommand.action!(
        context,
        'input',
      )) as MessageActionReturn;

      expect(result.content).toContain('Tested Input Required');
      expect(result.content).toContain('Custom sound file not found');
      expect(result.content).toContain('Using default system sound instead');
    });

    it('should return error for unknown notification type', async () => {
      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = await testSubcommand.action!(mockContext, 'unknown');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Unknown notification type'),
      });
      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should show message when notifications are disabled for individual test', async () => {
      const context = createMockCommandContext({
        services: {
          settings: {
            setValue: vi.fn(),
            merged: {
              general: {
                notifications: {
                  enabled: false,
                },
              },
            },
          },
        },
      });

      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = await testSubcommand.action!(context, 'input');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notifications are disabled'),
      });
      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should show message when specific notification type is disabled', async () => {
      const context = createMockCommandContext({
        services: {
          settings: {
            setValue: vi.fn(),
            merged: {
              general: {
                notifications: {
                  enabled: true,
                  events: {
                    inputRequired: { enabled: false, sound: 'system' },
                    taskComplete: { enabled: true, sound: 'system' },
                    idleAlert: { enabled: true, sound: 'system', timeout: 60 },
                  },
                },
              },
            },
          },
        },
      });

      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = await testSubcommand.action!(context, 'input');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('input notification is disabled'),
      });
      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should show options even when notifications are disabled', async () => {
      const context = createMockCommandContext({
        services: {
          settings: {
            setValue: vi.fn(),
            merged: {
              general: {
                notifications: {
                  enabled: false,
                },
              },
            },
          },
        },
      });

      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      const result = (await testSubcommand.action!(
        context,
        '',
      )) as MessageActionReturn;

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Test Notification Options'),
      });
      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
      expect(mockManagerInstance.dispose).toHaveBeenCalled();
    });

    it('should provide completion suggestions for test subcommand', async () => {
      const testSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'test',
      )!;

      expect(testSubcommand.completion).toBeDefined();
      if (testSubcommand.completion) {
        const completions = await testSubcommand.completion(mockContext, '');
        expect(completions).toEqual(['input', 'complete', 'idle']);

        const completionsWithPartial = await testSubcommand.completion(
          mockContext,
          'i',
        );
        expect(completionsWithPartial).toEqual(['input', 'idle']);

        const completionsWithComplete = await testSubcommand.completion(
          mockContext,
          'in',
        );
        expect(completionsWithComplete).toEqual(['input']);
      }
    });
  });

  describe('setup subcommand', () => {
    it('should show setup wizard when no arguments provided', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      const result = (await setupSubcommand.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notification Setup Wizard'),
      });
      expect(result.content).toContain('Current settings');
      expect(result.content).toContain('Step 1');
      expect(result.content).toContain('Step 2');
      expect(result.content).toContain('Step 3');
      expect(result.content).toContain('Step 4');
    });

    it('should enable notifications when setup enable is called', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      const result = await setupSubcommand.action!(mockContext, 'enable');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Notifications enabled'),
      });
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.enabled',
        true,
      );
    });

    it('should disable notifications when setup disable is called', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      const result = await setupSubcommand.action!(mockContext, 'disable');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('disabled'),
      });
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.enabled',
        false,
      );
    });

    it('should configure input required notification', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      // Test enable
      let result = (await setupSubcommand.action!(
        mockContext,
        'input on',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.inputRequired.enabled',
        true,
      );

      // Test disable
      result = (await setupSubcommand.action!(
        mockContext,
        'input off',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.inputRequired.enabled',
        false,
      );

      // Test custom
      result = (await setupSubcommand.action!(
        mockContext,
        'input custom /path/to/sound.wav',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.inputRequired.sound',
        'custom',
      );
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.inputRequired.customPath',
        '/path/to/sound.wav',
      );
    });

    it('should configure task complete notification', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      // Test enable
      let result = (await setupSubcommand.action!(
        mockContext,
        'complete on',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.taskComplete.enabled',
        true,
      );

      // Test disable
      result = (await setupSubcommand.action!(
        mockContext,
        'complete off',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.taskComplete.enabled',
        false,
      );

      // Test custom
      result = (await setupSubcommand.action!(
        mockContext,
        'complete custom /path/to/sound.wav',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.taskComplete.sound',
        'custom',
      );
    });

    it('should configure idle alert notification', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      // Test enable with timeout
      let result = (await setupSubcommand.action!(
        mockContext,
        'idle on 120',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.idleAlert.enabled',
        true,
      );
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.idleAlert.timeout',
        120,
      );

      // Test disable
      result = (await setupSubcommand.action!(
        mockContext,
        'idle off',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.idleAlert.enabled',
        false,
      );

      // Test custom
      result = (await setupSubcommand.action!(
        mockContext,
        'idle custom /path/to/sound.wav',
      )) as MessageActionReturn;
      expect(result.messageType).toBe('info');
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'general.notifications.events.idleAlert.sound',
        'custom',
      );
    });

    it('should return error for invalid input configuration', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      const result = await setupSubcommand.action!(
        mockContext,
        'input invalid',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Invalid input'),
      });
    });

    it('should return error for invalid idle timeout', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      const result = await setupSubcommand.action!(
        mockContext,
        'idle on invalid',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Invalid timeout'),
      });
    });

    it('should return error for unknown setup step', async () => {
      const setupSubcommand = notificationsCommand.subCommands!.find(
        (cmd) => cmd.name === 'setup',
      )!;

      const result = await setupSubcommand.action!(mockContext, 'unknown step');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Unknown setup step'),
      });
    });
  });
});
