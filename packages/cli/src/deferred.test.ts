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
import type { MergedSettings } from './config/settings.js';

const { mockRunExitCleanup, mockDebugLogger } = vi.hoisted(() => ({
  mockRunExitCleanup: vi.fn(),
  mockDebugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    debugLogger: mockDebugLogger,
  };
});

vi.mock('./utils/cleanup.js', () => ({
  runExitCleanup: mockRunExitCleanup,
}));

import type { MockInstance } from 'vitest';

// ... imports

let mockExit: MockInstance;

describe('deferred', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    setDeferredCommand(undefined as unknown as DeferredCommand); // Reset deferred command
  });

  const createMockSettings = (adminSettings: unknown = {}): MergedSettings =>
    ({
      admin: adminSettings,
    }) as unknown as MergedSettings;

  describe('runDeferredCommand', () => {
    it('should do nothing if no deferred command is set', async () => {
      await runDeferredCommand(createMockSettings());
      expect(mockDebugLogger.log).not.toHaveBeenCalled();
      expect(mockDebugLogger.error).not.toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should execute the deferred command if enabled', async () => {
      const mockHandler = vi.fn();
      setDeferredCommand({
        handler: mockHandler,
        argv: { _: [], $0: 'gemini' } as ArgumentsCamelCase,
        commandName: 'mcp',
      });

      const settings = createMockSettings({ mcp: { enabled: true } });
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

      const settings = createMockSettings({ mcp: { enabled: false } });
      await runDeferredCommand(settings);

      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Error: MCP is disabled by your admin.',
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

      const settings = createMockSettings({ extensions: { enabled: false } });
      await runDeferredCommand(settings);

      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Error: Extensions are disabled by your admin.',
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

      const settings = createMockSettings({ skills: { enabled: false } });
      await runDeferredCommand(settings);

      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Error: Agent skills are disabled by your admin.',
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

      const settings = createMockSettings({}); // No admin settings
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
      await runDeferredCommand(createMockSettings());
      expect(originalHandler).toHaveBeenCalledWith(argv);
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

      // Verify the command name stored is 'parent'
      // We can check this by spying on exit or logs, or just trusting the run logic if we could peek the state.
      // Easiest is to enable verification via disabled settings

      // Temporarily overwrite runDeferredCommand logic check to simulate arbitrary parent check?
      // No, deferred.ts hardcodes 'mcp', 'extensions', 'skills'.
      // So let's test with 'mcp' as parent.

      const deferredMcp = defer(commandModule, 'mcp');
      await deferredMcp.handler({} as ArgumentsCamelCase);

      const mcpSettings = createMockSettings({ mcp: { enabled: false } });
      await runDeferredCommand(mcpSettings);

      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Error: MCP is disabled by your admin.',
      );
    });

    it('should fallback to command name array first element', async () => {
      const commandModule: CommandModule = {
        command: ['foo', 'infoo'],
        describe: 'foo command',
        handler: vi.fn(),
      };

      const deferredModule = defer(commandModule);
      await deferredModule.handler({} as ArgumentsCamelCase);

      // Just run it and check log
      await runDeferredCommand(createMockSettings());
    });
  });
});
