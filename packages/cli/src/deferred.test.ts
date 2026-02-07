/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runDeferredCommand,
  defer,
  setDeferredCommand,
  type DeferredCommand,
} from './deferred.js';
import { ExitCodes } from '@google/gemini-cli-core';
import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { createMockSettings } from './test-utils/settings.js';
import type { MockInstance } from 'vitest';

const { mockRunExitCleanup, mockCoreEvents } = vi.hoisted(() => ({
  mockRunExitCleanup: vi.fn(),
  mockCoreEvents: {
    emitFeedback: vi.fn(),
  },
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    coreEvents: mockCoreEvents,
  };
});

vi.mock('./utils/cleanup.js', () => ({
  runExitCleanup: mockRunExitCleanup,
}));

let mockExit: MockInstance;

describe('deferred', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    setDeferredCommand(undefined as unknown as DeferredCommand); // Reset deferred command
  });

  describe('runDeferredCommand', () => {
    it('should do nothing if no deferred command is set', async () => {
      await runDeferredCommand(createMockSettings().merged);
      expect(mockCoreEvents.emitFeedback).not.toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should execute the deferred command if enabled', async () => {
      const mockHandler = vi.fn();
      setDeferredCommand({
        handler: mockHandler,
        argv: { _: [], $0: 'gemini' } as ArgumentsCamelCase,
        commandName: 'mcp',
      });

      const settings = createMockSettings({
        merged: { admin: { mcp: { enabled: true } } },
      }).merged;
      await runDeferredCommand(settings);
      expect(mockHandler).toHaveBeenCalled();
      expect(mockRunExitCleanup).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.SUCCESS);
    });

    it('should exit with FATAL_CONFIG_ERROR if MCP is disabled', async () => {
      setDeferredCommand({
        handler: vi.fn(),
        argv: {} as ArgumentsCamelCase,
        commandName: 'mcp',
      });

      const settings = createMockSettings({
        merged: { admin: { mcp: { enabled: false } } },
      }).merged;
      await runDeferredCommand(settings);

      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'MCP is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
      expect(mockRunExitCleanup).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.FATAL_CONFIG_ERROR);
    });

    it('should exit with FATAL_CONFIG_ERROR if extensions are disabled', async () => {
      setDeferredCommand({
        handler: vi.fn(),
        argv: {} as ArgumentsCamelCase,
        commandName: 'extensions',
      });

      const settings = createMockSettings({
        merged: { admin: { extensions: { enabled: false } } },
      }).merged;
      await runDeferredCommand(settings);

      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Extensions is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
      expect(mockRunExitCleanup).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.FATAL_CONFIG_ERROR);
    });

    it('should exit with FATAL_CONFIG_ERROR if skills are disabled', async () => {
      setDeferredCommand({
        handler: vi.fn(),
        argv: {} as ArgumentsCamelCase,
        commandName: 'skills',
      });

      const settings = createMockSettings({
        merged: { admin: { skills: { enabled: false } } },
      }).merged;
      await runDeferredCommand(settings);

      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Agent skills is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
      expect(mockRunExitCleanup).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.FATAL_CONFIG_ERROR);
    });

    it('should execute if admin settings are undefined (default implicit enable)', async () => {
      const mockHandler = vi.fn();
      setDeferredCommand({
        handler: mockHandler,
        argv: {} as ArgumentsCamelCase,
        commandName: 'mcp',
      });

      const settings = createMockSettings({}).merged; // No admin settings
      await runDeferredCommand(settings);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.SUCCESS);
    });
  });

  describe('defer', () => {
    it('should wrap a command module and defer execution', async () => {
      const originalHandler = vi.fn();
      const commandModule: CommandModule = {
        command: 'test',
        describe: 'test command',
        handler: originalHandler,
      };

      const deferredModule = defer(commandModule);
      expect(deferredModule.command).toBe(commandModule.command);

      // Execute the wrapper handler
      const argv = { _: [], $0: 'gemini' } as ArgumentsCamelCase;
      await deferredModule.handler(argv);

      // Should check that it set the deferred command, but didn't run original handler yet
      expect(originalHandler).not.toHaveBeenCalled();

      // Now manually run it to verify it captured correctly
      await runDeferredCommand(createMockSettings().merged);
      expect(originalHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            admin: expect.objectContaining({
              extensions: expect.objectContaining({ enabled: true }),
            }),
          }),
        }),
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.SUCCESS);
    });

    it('should use parentCommandName if provided', async () => {
      const commandModule: CommandModule = {
        command: 'subcommand',
        describe: 'sub command',
        handler: vi.fn(),
      };

      const deferredModule = defer(commandModule, 'parent');
      await deferredModule.handler({} as ArgumentsCamelCase);

      const deferredMcp = defer(commandModule, 'mcp');
      await deferredMcp.handler({} as ArgumentsCamelCase);

      const mcpSettings = createMockSettings({
        merged: { admin: { mcp: { enabled: false } } },
      }).merged;
      await runDeferredCommand(mcpSettings);

      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'MCP is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
    });

    it('should fallback to unknown if no parentCommandName is provided', async () => {
      const mockHandler = vi.fn();
      const commandModule: CommandModule = {
        command: ['foo', 'infoo'],
        describe: 'foo command',
        handler: mockHandler,
      };

      const deferredModule = defer(commandModule);
      await deferredModule.handler({} as ArgumentsCamelCase);

      // Verify it runs even if all known commands are disabled,
      // confirming it didn't capture 'mcp', 'extensions', or 'skills'
      // and defaulted to 'unknown' (or something else safe).
      const settings = createMockSettings({
        merged: {
          admin: {
            mcp: { enabled: false },
            extensions: { enabled: false },
            skills: { enabled: false },
          },
        },
      }).merged;

      await runDeferredCommand(settings);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.SUCCESS);
    });
  });
});
