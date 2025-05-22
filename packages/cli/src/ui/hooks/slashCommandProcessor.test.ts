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
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { act, renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import open from 'open';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import { MessageType } from '../types.js';
import * as memoryUtils from '../../config/memoryUtils.js';
import { type Config, MemoryTool } from '@gemini-code/server';
import * as fsPromises from 'node:fs/promises';

// Import the module for mocking its functions
import * as ShowMemoryCommandModule from './useShowMemoryCommand.js';

// Mock dependencies
vi.mock('./useShowMemoryCommand.js', () => ({
  SHOW_MEMORY_COMMAND_NAME: '/memory show',
  createShowMemoryAction: vi.fn(() => vi.fn()),
}));

// Spy on the static method we want to mock
const performAddMemoryEntrySpy = vi.spyOn(MemoryTool, 'performAddMemoryEntry');

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
      getSandbox: vi.fn(() => 'test-sandbox'), // Added mock
      getModel: vi.fn(() => 'test-model'), // Added mock
    } as unknown as Config;
    mockCorgiMode = vi.fn();

    // Clear mocks for fsPromises if they were used directly or indirectly
    vi.mocked(fsPromises.readFile).mockClear();
    vi.mocked(fsPromises.writeFile).mockClear();
    vi.mocked(fsPromises.mkdir).mockClear();

    performAddMemoryEntrySpy.mockReset();
    (open as Mock).mockClear();
    // vi.spyOn(memoryUtils, 'deleteLastMemoryEntry').mockImplementation(vi.fn());
    // vi.spyOn(memoryUtils, 'deleteAllAddedMemoryEntries').mockImplementation(
    //   vi.fn(),
    // );

    // vi.mocked(memoryUtils.deleteLastMemoryEntry).mockClear();
    // vi.mocked(memoryUtils.deleteAllAddedMemoryEntries).mockClear();

    mockProcessExit.mockClear();
    (ShowMemoryCommandModule.createShowMemoryAction as Mock).mockClear();
    mockPerformMemoryRefresh.mockClear();
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
    it('should call MemoryTool.performAddMemoryEntry and refresh on valid input', async () => {
      performAddMemoryEntrySpy.mockResolvedValue(undefined);
      const { handleSlashCommand } = getProcessor();
      const fact = 'Remember this fact';
      await act(async () => {
        handleSlashCommand(`/memory add ${fact}`);
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: MessageType.USER,
          text: `/memory add ${fact}`,
        }),
        expect.any(Number),
      );
      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        fact,
        memoryUtils.getGlobalMemoryFilePath(), // Ensure this path is correct
        {
          readFile: fsPromises.readFile,
          writeFile: fsPromises.writeFile,
          mkdir: fsPromises.mkdir,
        },
      );
      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Successfully added to memory: "${fact}"`,
        }),
        expect.any(Number),
      );
    });

    it('should show usage error if no text is provided', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory add ');
      });
      expect(performAddMemoryEntrySpy).not.toHaveBeenCalled();
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Usage: /memory add <text to remember>',
        }),
        expect.any(Number),
      );
    });

    it('should handle error from MemoryTool.performAddMemoryEntry', async () => {
      const fact = 'Another fact';
      performAddMemoryEntrySpy.mockRejectedValue(
        new Error('[MemoryTool] Failed to add memory entry: Disk full'),
      );
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand(`/memory add ${fact}`);
      });
      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        fact,
        memoryUtils.getGlobalMemoryFilePath(),
        {
          readFile: fsPromises.readFile,
          writeFile: fsPromises.writeFile,
          mkdir: fsPromises.mkdir,
        },
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Failed to add memory: [MemoryTool] Failed to add memory entry: Disk full',
        }),
        expect.any(Number),
      );
    });
  });

  describe('/memory show', () => {
    it('should call the showMemoryAction', async () => {
      const mockReturnedShowAction = vi.fn();
      vi.mocked(ShowMemoryCommandModule.createShowMemoryAction).mockReturnValue(
        mockReturnedShowAction,
      );
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory show');
      });
      expect(
        ShowMemoryCommandModule.createShowMemoryAction,
      ).toHaveBeenCalledWith(mockConfig, expect.any(Function));
      expect(mockReturnedShowAction).toHaveBeenCalled();
    });
  });

  describe('/memory refresh', () => {
    it('should call performMemoryRefresh', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory refresh');
      });
      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
    });
  });

  describe('Unknown /memory subcommand', () => {
    it('should show an error for unknown /memory subcommand', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory foobar');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown /memory command: foobar. Available: show, refresh, add',
        }),
        expect.any(Number),
      );
    });
  });

  describe('Other commands', () => {
    it('/help should open help', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/help');
      });
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
    });
  });

  describe('/bug command', () => {
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
      const modelVersion = 'test-model'; // From mockConfig

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

    it('should call open with the correct GitHub issue URL', async () => {
      process.env.SANDBOX = 'gemini-sandbox';
      process.env.SEATBELT_PROFILE = 'test_profile';
      const { handleSlashCommand } = getProcessor();
      const bugDescription = 'This is a test bug';
      const expectedUrl = getExpectedUrl(
        bugDescription,
        process.env.SANDBOX,
        process.env.SEATBELT_PROFILE,
      );

      await act(async () => {
        handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        1, // User command
        expect.objectContaining({
          type: MessageType.USER,
          text: `/bug ${bugDescription}`,
        }),
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Info message
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To submit your bug report, please open the following URL in your browser:\n${expectedUrl}`,
        }),
        expect.any(Number), // Timestamps are numbers from Date.now()
      );
      expect(open).toHaveBeenCalledWith(expectedUrl);
      delete process.env.SANDBOX;
      delete process.env.SEATBELT_PROFILE;
    });

    it('should open the generic issue page if no bug description is provided', async () => {
      process.env.SANDBOX = 'sandbox-exec';
      process.env.SEATBELT_PROFILE = 'minimal';
      const { handleSlashCommand } = getProcessor();
      const expectedUrl = getExpectedUrl(
        undefined,
        process.env.SANDBOX,
        process.env.SEATBELT_PROFILE,
      );
      await act(async () => {
        handleSlashCommand('/bug ');
      });
      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(mockAddItem).toHaveBeenNthCalledWith(
        1, // User command
        expect.objectContaining({
          type: MessageType.USER,
          text: '/bug', // Ensure this matches the input
        }),
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Info message
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To submit your bug report, please open the following URL in your browser:\n${expectedUrl}`,
        }),
        expect.any(Number), // Timestamps are numbers from Date.now()
      );
      delete process.env.SANDBOX;
      delete process.env.SEATBELT_PROFILE;
    });

    it('should handle errors when open fails', async () => {
      // Test with no SANDBOX env var
      delete process.env.SANDBOX;
      delete process.env.SEATBELT_PROFILE;
      const { handleSlashCommand } = getProcessor();
      const bugDescription = 'Another bug';
      const expectedUrl = getExpectedUrl(bugDescription);
      const openError = new Error('Failed to open browser');
      (open as Mock).mockRejectedValue(openError);

      await act(async () => {
        handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(mockAddItem).toHaveBeenNthCalledWith(
        1, // User command
        expect.objectContaining({
          type: MessageType.USER,
          text: `/bug ${bugDescription}`,
        }),
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Info message before open attempt
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To submit your bug report, please open the following URL in your browser:\n${expectedUrl}`,
        }),
        expect.any(Number), // Timestamps are numbers from Date.now()
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        3, // Error message after open fails
        expect.objectContaining({
          type: MessageType.ERROR,
          text: `Could not open URL in browser: ${openError.message}`,
        }),
        expect.any(Number), // Timestamps are numbers from Date.now()
      );
    });
  });

  describe('Unknown command', () => {
    it('should show an error for a general unknown command', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/unknowncommand');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /unknowncommand',
        }),
        expect.any(Number),
      );
    });
  });
});
