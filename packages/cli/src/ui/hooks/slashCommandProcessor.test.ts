/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { mockProcessExit } = vi.hoisted(() => ({
  mockProcessExit: vi.fn((_code?: number): never => undefined as never),
}));

vi.mock('node:process', () => ({
  exit: mockProcessExit,
  cwd: vi.fn(() => '/mock/cwd'),
  env: { ...process.env },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { act, renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import open from 'open';
import {
  useSlashCommandProcessor,
  type SlashCommandActionReturn,
} from './slashCommandProcessor.js';
import { MessageType } from '../types.js';
import { type Config } from '@gemini-code/server';

import * as ShowMemoryCommandModule from './useShowMemoryCommand.js';

vi.mock('./useShowMemoryCommand.js', () => ({
  SHOW_MEMORY_COMMAND_NAME: '/memory show',
  createShowMemoryAction: vi.fn(() => vi.fn()),
}));

vi.mock('open', () => ({
  default: vi.fn(),
}));

describe('useSlashCommandProcessor', () => {
  let mockAddItem: ReturnType<typeof vi.fn>;
  let mockClearItems: ReturnType<typeof vi.fn>;
  let mockRefreshStatic: ReturnType<typeof vi.fn>;
  let mockSetShowHelp: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;
  let mockOpenThemeDialog: ReturnType<typeof vi.fn>;
  let mockPerformMemoryRefresh: ReturnType<typeof vi.fn>;
  let mockConfig: Config;
  let mockCorgiMode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockClearItems = vi.fn();
    mockRefreshStatic = vi.fn();
    mockSetShowHelp = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockOpenThemeDialog = vi.fn();
    mockPerformMemoryRefresh = vi.fn().mockResolvedValue(undefined);
    mockConfig = {
      getDebugMode: vi.fn(() => false),
      getSandbox: vi.fn(() => 'test-sandbox'),
      getModel: vi.fn(() => 'test-model'),
    } as unknown as Config;
    mockCorgiMode = vi.fn();

    (open as Mock).mockClear();
    mockProcessExit.mockClear();
    (ShowMemoryCommandModule.createShowMemoryAction as Mock).mockClear();
    mockPerformMemoryRefresh.mockClear();
    process.env = { ...globalThis.process.env };
  });

  const getProcessor = () => {
    const { result } = renderHook(() =>
      useSlashCommandProcessor(
        mockConfig,
        mockAddItem,
        mockClearItems,
        mockRefreshStatic,
        mockSetShowHelp,
        mockOnDebugMessage,
        mockOpenThemeDialog,
        mockPerformMemoryRefresh,
        mockCorgiMode,
        'test-version',
      ),
    );
    return result.current;
  };

  describe('/memory add', () => {
    it('should return tool scheduling info on valid input', async () => {
      const { handleSlashCommand } = getProcessor();
      const fact = 'Remember this fact';
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand(`/memory add ${fact}`);
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        1, // User message
        expect.objectContaining({
          type: MessageType.USER,
          text: `/memory add ${fact}`,
        }),
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Info message about attempting to save
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Attempting to save to memory: "${fact}"`,
        }),
        expect.any(Number),
      );

      expect(commandResult).toEqual({
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact },
      });

      // performMemoryRefresh is no longer called directly here
      expect(mockPerformMemoryRefresh).not.toHaveBeenCalled();
    });

    it('should show usage error and return true if no text is provided', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/memory add ');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // After user message
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Usage: /memory add <text to remember>',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true); // Command was handled (by showing an error)
    });
  });

  describe('/memory show', () => {
    it('should call the showMemoryAction and return true', async () => {
      const mockReturnedShowAction = vi.fn();
      vi.mocked(ShowMemoryCommandModule.createShowMemoryAction).mockReturnValue(
        mockReturnedShowAction,
      );
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/memory show');
      });
      expect(
        ShowMemoryCommandModule.createShowMemoryAction,
      ).toHaveBeenCalledWith(mockConfig, expect.any(Function));
      expect(mockReturnedShowAction).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });
  });

  describe('/memory refresh', () => {
    it('should call performMemoryRefresh and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/memory refresh');
      });
      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });
  });

  describe('Unknown /memory subcommand', () => {
    it('should show an error for unknown /memory subcommand and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/memory foobar');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown /memory command: foobar. Available: show, refresh, add',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });
  });

  describe('Other commands', () => {
    it('/help should open help and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/help');
      });
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
      expect(commandResult).toBe(true);
    });
  });

  describe('/bug command', () => {
    const originalEnv = process.env;
    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    const getExpectedUrl = (
      description?: string,
      sandboxEnvVar?: string,
      seatbeltProfileVar?: string,
    ) => {
      const cliVersion = 'test-version';
      const osVersion = `${process.platform} ${process.version}`;
      let sandboxEnvStr = 'no sandbox';
      if (sandboxEnvVar && sandboxEnvVar !== 'sandbox-exec') {
        sandboxEnvStr = sandboxEnvVar.replace(/^gemini-(?:code-)?/, '');
      } else if (sandboxEnvVar === 'sandbox-exec') {
        sandboxEnvStr = `sandbox-exec (${seatbeltProfileVar || 'unknown'})`;
      }
      const modelVersion = 'test-model';

      const diagnosticInfo = `
## Describe the bug
A clear and concise description of what the bug is.

## Additional context
Add any other context about the problem here.

## Diagnostic Information
*   **CLI Version:** ${cliVersion}
*   **Operating System:** ${osVersion}
*   **Sandbox Environment:** ${sandboxEnvStr}
*   **Model Version:** ${modelVersion}
`;
      let url =
        'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.md';
      if (description) {
        url += `&title=${encodeURIComponent(description)}`;
      }
      url += `&body=${encodeURIComponent(diagnosticInfo)}`;
      return url;
    };

    it('should call open with the correct GitHub issue URL and return true', async () => {
      process.env.SANDBOX = 'gemini-sandbox';
      process.env.SEATBELT_PROFILE = 'test_profile';
      const { handleSlashCommand } = getProcessor();
      const bugDescription = 'This is a test bug';
      const expectedUrl = getExpectedUrl(
        bugDescription,
        process.env.SANDBOX,
        process.env.SEATBELT_PROFILE,
      );
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(commandResult).toBe(true);
    });
  });

  describe('Unknown command', () => {
    it('should show an error and return true for a general unknown command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/unknowncommand');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /unknowncommand',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });
  });
});
