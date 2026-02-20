/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { waitFor } from '../../test-utils/async.js';
import { act, useState } from 'react';
import type { InputPromptProps } from './InputPrompt.js';
import { InputPrompt, tryTogglePasteExpansion } from './InputPrompt.js';
import type { TextBuffer } from './shared/text-buffer.js';
import {
  calculateTransformationsForLine,
  calculateTransformedLine,
} from './shared/text-buffer.js';
import type { Config } from '@google/gemini-cli-core';
import { ApprovalMode, debugLogger } from '@google/gemini-cli-core';
import * as path from 'node:path';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Text } from 'ink';
import type { UseShellHistoryReturn } from '../hooks/useShellHistory.js';
import { useShellHistory } from '../hooks/useShellHistory.js';
import type { UseCommandCompletionReturn } from '../hooks/useCommandCompletion.js';
import {
  useCommandCompletion,
  CompletionMode,
} from '../hooks/useCommandCompletion.js';
import type { UseInputHistoryReturn } from '../hooks/useInputHistory.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import type { UseReverseSearchCompletionReturn } from '../hooks/useReverseSearchCompletion.js';
import { useReverseSearchCompletion } from '../hooks/useReverseSearchCompletion.js';
import clipboardy from 'clipboardy';
import * as clipboardUtils from '../utils/clipboardUtils.js';
import { useKittyKeyboardProtocol } from '../hooks/useKittyKeyboardProtocol.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import { StreamingState } from '../types.js';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
import type { UIState } from '../contexts/UIStateContext.js';
import { isLowColorDepth } from '../utils/terminalUtils.js';
import { cpLen } from '../utils/textUtils.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { Key } from '../hooks/useKeypress.js';
import {
  appEvents,
  AppEvent,
  TransientMessageType,
} from '../../utils/events.js';

vi.mock('../hooks/useShellHistory.js');
vi.mock('../hooks/useCommandCompletion.js');
vi.mock('../hooks/useInputHistory.js');
vi.mock('../hooks/useReverseSearchCompletion.js');
vi.mock('clipboardy');
vi.mock('../utils/clipboardUtils.js');
vi.mock('../hooks/useKittyKeyboardProtocol.js');
vi.mock('../utils/terminalUtils.js', () => ({
  isLowColorDepth: vi.fn(() => false),
}));

// Mock ink BEFORE importing components that use it to intercept terminalCursorPosition
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    Text: vi.fn(({ children, ...props }) => (
      <actual.Text {...props}>{children}</actual.Text>
    )),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockSlashCommands: SlashCommand[] = [
  {
    name: 'clear',
    kind: CommandKind.BUILT_IN,
    description: 'Clear screen',
    action: vi.fn(),
  },
  {
    name: 'memory',
    kind: CommandKind.BUILT_IN,
    description: 'Manage memory',
    subCommands: [
      {
        name: 'show',
        kind: CommandKind.BUILT_IN,
        description: 'Show memory',
        action: vi.fn(),
      },
      {
        name: 'add',
        kind: CommandKind.BUILT_IN,
        description: 'Add to memory',
        action: vi.fn(),
      },
      {
        name: 'refresh',
        kind: CommandKind.BUILT_IN,
        description: 'Refresh memory',
        action: vi.fn(),
      },
    ],
  },
  {
    name: 'chat',
    description: 'Manage chats',
    kind: CommandKind.BUILT_IN,
    subCommands: [
      {
        name: 'resume',
        description: 'Resume a chat',
        kind: CommandKind.BUILT_IN,
        action: vi.fn(),
        completion: async () => ['fix-foo', 'fix-bar'],
      },
    ],
  },
  {
    name: 'resume',
    description: 'Browse and resume sessions',
    kind: CommandKind.BUILT_IN,
    action: vi.fn(),
  },
];

describe('InputPrompt', () => {
  let props: InputPromptProps;
  let mockShellHistory: UseShellHistoryReturn;
  let mockCommandCompletion: UseCommandCompletionReturn;
  let mockInputHistory: UseInputHistoryReturn;
  let mockReverseSearchCompletion: UseReverseSearchCompletionReturn;
  let mockBuffer: TextBuffer;
  let mockCommandContext: CommandContext;

  const mockedUseShellHistory = vi.mocked(useShellHistory);
  const mockedUseCommandCompletion = vi.mocked(useCommandCompletion);
  const mockedUseInputHistory = vi.mocked(useInputHistory);
  const mockedUseReverseSearchCompletion = vi.mocked(
    useReverseSearchCompletion,
  );
  const mockedUseKittyKeyboardProtocol = vi.mocked(useKittyKeyboardProtocol);
  const mockSetEmbeddedShellFocused = vi.fn();
  const mockSetCleanUiDetailsVisible = vi.fn();
  const mockToggleCleanUiDetailsVisible = vi.fn();
  const mockRevealCleanUiDetailsTemporarily = vi.fn();
  const uiActions = {
    setEmbeddedShellFocused: mockSetEmbeddedShellFocused,
    setCleanUiDetailsVisible: mockSetCleanUiDetailsVisible,
    toggleCleanUiDetailsVisible: mockToggleCleanUiDetailsVisible,
    revealCleanUiDetailsTemporarily: mockRevealCleanUiDetailsTemporarily,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(
      terminalCapabilityManager,
      'isKittyProtocolEnabled',
    ).mockReturnValue(true);

    mockCommandContext = createMockCommandContext();

    mockBuffer = {
      text: '',
      cursor: [0, 0],
      lines: [''],
      setText: vi.fn(
        (newText: string, cursorPosition?: 'start' | 'end' | number) => {
          mockBuffer.text = newText;
          mockBuffer.lines = [newText];
          let col = 0;
          if (typeof cursorPosition === 'number') {
            col = cursorPosition;
          } else if (cursorPosition === 'start') {
            col = 0;
          } else {
            col = newText.length;
          }
          mockBuffer.cursor = [0, col];
          mockBuffer.viewportVisualLines = [newText];
          mockBuffer.allVisualLines = [newText];
          mockBuffer.visualToLogicalMap = [[0, 0]];
          mockBuffer.visualCursor = [0, col];
        },
      ),
      replaceRangeByOffset: vi.fn(),
      viewportVisualLines: [''],
      allVisualLines: [''],
      visualCursor: [0, 0],
      visualScrollRow: 0,
      handleInput: vi.fn((key: Key) => {
        if (keyMatchers[Command.CLEAR_INPUT](key)) {
          if (mockBuffer.text.length > 0) {
            mockBuffer.setText('');
            return true;
          }
          return false;
        }
        return false;
      }),
      move: vi.fn((dir: string) => {
        if (dir === 'home') {
          mockBuffer.visualCursor = [mockBuffer.visualCursor[0], 0];
        } else if (dir === 'end') {
          const line =
            mockBuffer.allVisualLines[mockBuffer.visualCursor[0]] || '';
          mockBuffer.visualCursor = [mockBuffer.visualCursor[0], cpLen(line)];
        }
      }),
      moveToOffset: vi.fn((offset: number) => {
        mockBuffer.cursor = [0, offset];
      }),
      moveToVisualPosition: vi.fn(),
      killLineRight: vi.fn(),
      killLineLeft: vi.fn(),
      openInExternalEditor: vi.fn(),
      newline: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      backspace: vi.fn(),
      preferredCol: null,
      selectionAnchor: null,
      insert: vi.fn(),
      del: vi.fn(),
      replaceRange: vi.fn(),
      deleteWordLeft: vi.fn(),
      deleteWordRight: vi.fn(),
      visualToLogicalMap: [[0, 0]],
      visualToTransformedMap: [0],
      transformationsByLine: [],
      getOffset: vi.fn().mockReturnValue(0),
      pastedContent: {},
    } as unknown as TextBuffer;

    mockShellHistory = {
      history: [],
      addCommandToHistory: vi.fn(),
      getPreviousCommand: vi.fn().mockReturnValue(null),
      getNextCommand: vi.fn().mockReturnValue(null),
      resetHistoryPosition: vi.fn(),
    };
    mockedUseShellHistory.mockReturnValue(mockShellHistory);

    mockCommandCompletion = {
      suggestions: [],
      activeSuggestionIndex: -1,
      isLoadingSuggestions: false,
      showSuggestions: false,
      visibleStartIndex: 0,
      isPerfectMatch: false,
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      resetCompletionState: vi.fn(),
      setActiveSuggestionIndex: vi.fn(),
      handleAutocomplete: vi.fn(),
      promptCompletion: {
        text: '',
        accept: vi.fn(),
        clear: vi.fn(),
        isLoading: false,
        isActive: false,
        markSelected: vi.fn(),
      },
      getCommandFromSuggestion: vi.fn().mockReturnValue(undefined),
      slashCompletionRange: {
        completionStart: -1,
        completionEnd: -1,
        getCommandFromSuggestion: vi.fn().mockReturnValue(undefined),
        isArgumentCompletion: false,
        leafCommand: null,
      },
      getCompletedText: vi.fn().mockReturnValue(null),
      completionMode: CompletionMode.IDLE,
    };
    mockedUseCommandCompletion.mockReturnValue(mockCommandCompletion);

    mockInputHistory = {
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      handleSubmit: vi.fn(),
    };
    mockedUseInputHistory.mockImplementation(({ onSubmit }) => {
      mockInputHistory.handleSubmit = vi.fn((val) => onSubmit(val));
      return mockInputHistory;
    });

    mockReverseSearchCompletion = {
      suggestions: [],
      activeSuggestionIndex: -1,
      visibleStartIndex: 0,
      showSuggestions: false,
      isLoadingSuggestions: false,
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      handleAutocomplete: vi.fn(),
      resetCompletionState: vi.fn(),
    };
    mockedUseReverseSearchCompletion.mockReturnValue(
      mockReverseSearchCompletion,
    );

    mockedUseKittyKeyboardProtocol.mockReturnValue({
      enabled: false,
      checking: false,
    });

    vi.mocked(clipboardy.read).mockResolvedValue('');

    props = {
      buffer: mockBuffer,
      onSubmit: vi.fn(),
      userMessages: [],
      onClearScreen: vi.fn(),
      config: {
        getProjectRoot: () => path.join('test', 'project'),
        getTargetDir: () => path.join('test', 'project', 'src'),
        getVimMode: () => false,
        getUseBackgroundColor: () => true,
        getTerminalBackground: () => undefined,
        getWorkspaceContext: () => ({
          getDirectories: () => ['/test/project/src'],
        }),
      } as unknown as Config,
      slashCommands: mockSlashCommands,
      commandContext: mockCommandContext,
      shellModeActive: false,
      setShellModeActive: vi.fn(),
      approvalMode: ApprovalMode.DEFAULT,
      inputWidth: 80,
      suggestionsWidth: 80,
      focus: true,
      setQueueErrorMessage: vi.fn(),
      streamingState: StreamingState.Idle,
      setBannerVisible: vi.fn(),
    };
  });

  it('should call shellHistory.getPreviousCommand on up arrow in shell mode', async () => {
    props.shellModeActive = true;
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\u001B[A');
    });
    await waitFor(() =>
      expect(mockShellHistory.getPreviousCommand).toHaveBeenCalled(),
    );
    unmount();
  });

  it('should call shellHistory.getNextCommand on down arrow in shell mode', async () => {
    props.shellModeActive = true;
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\u001B[B');
      await waitFor(() =>
        expect(mockShellHistory.getNextCommand).toHaveBeenCalled(),
      );
    });
    unmount();
  });

  it('should set the buffer text when a shell history command is retrieved', async () => {
    props.shellModeActive = true;
    vi.mocked(mockShellHistory.getPreviousCommand).mockReturnValue(
      'previous command',
    );
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\u001B[A');
    });
    await waitFor(() => {
      expect(mockShellHistory.getPreviousCommand).toHaveBeenCalled();
      expect(props.buffer.setText).toHaveBeenCalledWith('previous command');
    });
    unmount();
  });

  it('should call shellHistory.addCommandToHistory on submit in shell mode', async () => {
    props.shellModeActive = true;
    props.buffer.setText('ls -l');
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => {
      expect(mockShellHistory.addCommandToHistory).toHaveBeenCalledWith(
        'ls -l',
      );
      expect(props.onSubmit).toHaveBeenCalledWith('ls -l');
    });
    unmount();
  });

  it('should NOT call shell history methods when not in shell mode', async () => {
    props.buffer.setText('some text');
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\u0010'); // Ctrl+P
    });
    await waitFor(() => expect(mockInputHistory.navigateUp).toHaveBeenCalled());

    await act(async () => {
      stdin.write('\u000E'); // Ctrl+N
    });
    await waitFor(() =>
      expect(mockInputHistory.navigateDown).toHaveBeenCalled(),
    );

    await act(async () => {
      stdin.write('\r'); // Enter
    });
    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledWith('some text'),
    );

    expect(mockShellHistory.getPreviousCommand).not.toHaveBeenCalled();
    expect(mockShellHistory.getNextCommand).not.toHaveBeenCalled();
    expect(mockShellHistory.addCommandToHistory).not.toHaveBeenCalled();
    unmount();
  });

  describe('arrow key navigation', () => {
    it('should move to start of line on Up arrow if on first line but not at start', async () => {
      mockBuffer.allVisualLines = ['line 1', 'line 2'];
      mockBuffer.visualCursor = [0, 5]; // First line, not at start
      mockBuffer.visualScrollRow = 0;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
        },
      );

      await act(async () => {
        stdin.write('\u001B[A'); // Up arrow
      });

      await waitFor(() => {
        expect(mockBuffer.move).toHaveBeenCalledWith('home');
        expect(mockInputHistory.navigateUp).not.toHaveBeenCalled();
      });
      unmount();
    });

    it('should navigate history on Up arrow if on first line and at start', async () => {
      mockBuffer.allVisualLines = ['line 1', 'line 2'];
      mockBuffer.visualCursor = [0, 0]; // First line, at start
      mockBuffer.visualScrollRow = 0;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
        },
      );

      await act(async () => {
        stdin.write('\u001B[A'); // Up arrow
      });

      await waitFor(() => {
        expect(mockBuffer.move).not.toHaveBeenCalledWith('home');
        expect(mockInputHistory.navigateUp).toHaveBeenCalled();
      });
      unmount();
    });

    it('should move to end of line on Down arrow if on last line but not at end', async () => {
      mockBuffer.allVisualLines = ['line 1', 'line 2'];
      mockBuffer.visualCursor = [1, 0]; // Last line, not at end
      mockBuffer.visualScrollRow = 0;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
        },
      );

      await act(async () => {
        stdin.write('\u001B[B'); // Down arrow
      });

      await waitFor(() => {
        expect(mockBuffer.move).toHaveBeenCalledWith('end');
        expect(mockInputHistory.navigateDown).not.toHaveBeenCalled();
      });
      unmount();
    });

    it('should navigate history on Down arrow if on last line and at end', async () => {
      mockBuffer.allVisualLines = ['line 1', 'line 2'];
      mockBuffer.visualCursor = [1, 6]; // Last line, at end ("line 2" is length 6)
      mockBuffer.visualScrollRow = 0;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
        },
      );

      await act(async () => {
        stdin.write('\u001B[B'); // Down arrow
      });

      await waitFor(() => {
        expect(mockBuffer.move).not.toHaveBeenCalledWith('end');
        expect(mockInputHistory.navigateDown).toHaveBeenCalled();
      });
      unmount();
    });
  });

  it('should call completion.navigateUp for both up arrow and Ctrl+P when suggestions are showing', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'memory', value: 'memory' },
        { label: 'memcache', value: 'memcache' },
      ],
    });

    props.buffer.setText('/mem');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    // Test up arrow
    await act(async () => {
      stdin.write('\u001B[A'); // Up arrow
    });
    await waitFor(() =>
      expect(mockCommandCompletion.navigateUp).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      stdin.write('\u0010'); // Ctrl+P
    });
    await waitFor(() =>
      expect(mockCommandCompletion.navigateUp).toHaveBeenCalledTimes(2),
    );
    expect(mockCommandCompletion.navigateDown).not.toHaveBeenCalled();

    unmount();
  });

  it('should call completion.navigateDown for both down arrow and Ctrl+N when suggestions are showing', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'memory', value: 'memory' },
        { label: 'memcache', value: 'memcache' },
      ],
    });
    props.buffer.setText('/mem');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    // Test down arrow
    await act(async () => {
      stdin.write('\u001B[B'); // Down arrow
    });
    await waitFor(() =>
      expect(mockCommandCompletion.navigateDown).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      stdin.write('\u000E'); // Ctrl+N
    });
    await waitFor(() =>
      expect(mockCommandCompletion.navigateDown).toHaveBeenCalledTimes(2),
    );
    expect(mockCommandCompletion.navigateUp).not.toHaveBeenCalled();

    unmount();
  });

  it('should NOT call completion navigation when suggestions are not showing', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: false,
    });
    props.buffer.setText('some text');
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\u0010'); // Ctrl+P
    });
    await waitFor(() => expect(mockInputHistory.navigateUp).toHaveBeenCalled());
    await act(async () => {
      stdin.write('\u000E'); // Ctrl+N
    });
    await waitFor(() =>
      expect(mockInputHistory.navigateDown).toHaveBeenCalled(),
    );
    await act(async () => {
      stdin.write('\u0010'); // Ctrl+P
    });
    await act(async () => {
      stdin.write('\u000E'); // Ctrl+N
    });

    await waitFor(() => {
      expect(mockCommandCompletion.navigateUp).not.toHaveBeenCalled();
      expect(mockCommandCompletion.navigateDown).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should clear the buffer and reset completion on Ctrl+C', async () => {
    mockBuffer.text = 'some text';
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\u0003'); // Ctrl+C
    });

    await waitFor(() => {
      expect(mockBuffer.setText).toHaveBeenCalledWith('');
      expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
    });
    unmount();
  });

  describe('clipboard image paste', () => {
    beforeEach(() => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
      vi.mocked(clipboardUtils.saveClipboardImage).mockResolvedValue(null);
      vi.mocked(clipboardUtils.cleanupOldClipboardImages).mockResolvedValue(
        undefined,
      );
    });

    it('should handle Ctrl+V when clipboard has an image', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(true);
      vi.mocked(clipboardUtils.saveClipboardImage).mockResolvedValue(
        '/test/.gemini-clipboard/clipboard-123.png',
      );

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      // Send Ctrl+V
      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });
      await waitFor(() => {
        expect(clipboardUtils.clipboardHasImage).toHaveBeenCalled();
        expect(clipboardUtils.saveClipboardImage).toHaveBeenCalledWith(
          props.config.getTargetDir(),
        );
        expect(clipboardUtils.cleanupOldClipboardImages).toHaveBeenCalledWith(
          props.config.getTargetDir(),
        );
        expect(mockBuffer.replaceRangeByOffset).toHaveBeenCalled();
      });
      unmount();
    });

    it('should not insert anything when clipboard has no image', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });
      await waitFor(() => {
        expect(clipboardUtils.clipboardHasImage).toHaveBeenCalled();
      });
      expect(clipboardUtils.saveClipboardImage).not.toHaveBeenCalled();
      expect(mockBuffer.setText).not.toHaveBeenCalled();
      unmount();
    });

    it('should handle image save failure gracefully', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(true);
      vi.mocked(clipboardUtils.saveClipboardImage).mockResolvedValue(null);

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });
      await waitFor(() => {
        expect(clipboardUtils.saveClipboardImage).toHaveBeenCalled();
      });
      expect(mockBuffer.setText).not.toHaveBeenCalled();
      unmount();
    });

    it('should insert image path at cursor position with proper spacing', async () => {
      const imagePath = path.join(
        'test',
        '.gemini-clipboard',
        'clipboard-456.png',
      );
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(true);
      vi.mocked(clipboardUtils.saveClipboardImage).mockResolvedValue(imagePath);

      // Set initial text and cursor position
      mockBuffer.text = 'Hello world';
      mockBuffer.cursor = [0, 5]; // Cursor after "Hello"
      vi.mocked(mockBuffer.getOffset).mockReturnValue(5);
      mockBuffer.lines = ['Hello world'];
      mockBuffer.replaceRangeByOffset = vi.fn();

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });
      await waitFor(() => {
        // Should insert at cursor position with spaces
        expect(mockBuffer.replaceRangeByOffset).toHaveBeenCalled();
      });

      // Get the actual call to see what path was used
      const actualCall = vi.mocked(mockBuffer.replaceRangeByOffset).mock
        .calls[0];
      expect(actualCall[0]).toBe(5); // start offset
      expect(actualCall[1]).toBe(5); // end offset
      expect(actualCall[2]).toBe(
        ' @' + path.relative(path.join('test', 'project', 'src'), imagePath),
      );
      unmount();
    });

    it('should handle errors during clipboard operations', async () => {
      const debugLoggerErrorSpy = vi
        .spyOn(debugLogger, 'error')
        .mockImplementation(() => {});
      vi.mocked(clipboardUtils.clipboardHasImage).mockRejectedValue(
        new Error('Clipboard error'),
      );

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });
      await waitFor(() => {
        expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
          'Error handling paste:',
          expect.any(Error),
        );
      });
      expect(mockBuffer.setText).not.toHaveBeenCalled();

      debugLoggerErrorSpy.mockRestore();
      unmount();
    });
  });

  describe('clipboard text paste', () => {
    it('should insert text from clipboard on Ctrl+V', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
      vi.mocked(clipboardy.read).mockResolvedValue('pasted text');
      vi.mocked(mockBuffer.replaceRangeByOffset).mockClear();

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });

      await waitFor(() => {
        expect(clipboardy.read).toHaveBeenCalled();
        expect(mockBuffer.insert).toHaveBeenCalledWith(
          'pasted text',
          expect.objectContaining({ paste: true }),
        );
      });
      unmount();
    });

    it('should use OSC 52 when useOSC52Paste setting is enabled', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
      const settings = createMockSettings({
        experimental: { useOSC52Paste: true },
      });

      const { stdout, stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { settings },
      );

      const writeSpy = vi.spyOn(stdout, 'write');

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });

      await waitFor(() => {
        expect(writeSpy).toHaveBeenCalledWith('\x1b]52;c;?\x07');
      });
      // Should NOT call clipboardy.read()
      expect(clipboardy.read).not.toHaveBeenCalled();
      unmount();
    });
  });

  it.each([
    {
      name: 'should complete a partial parent command',
      bufferText: '/mem',
      suggestions: [{ label: 'memory', value: 'memory', description: '...' }],
      activeIndex: 0,
    },
    {
      name: 'should append a sub-command when parent command is complete',
      bufferText: '/memory ',
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeIndex: 1,
    },
    {
      name: 'should handle the backspace edge case correctly',
      bufferText: '/memory',
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeIndex: 0,
    },
    {
      name: 'should complete a partial argument for a command',
      bufferText: '/chat resume fi-',
      suggestions: [{ label: 'fix-foo', value: 'fix-foo' }],
      activeIndex: 0,
    },
  ])('$name', async ({ bufferText, suggestions, activeIndex }) => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions,
      activeSuggestionIndex: activeIndex,
    });
    props.buffer.setText(bufferText);
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => stdin.write('\t'));
    await waitFor(() =>
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(
        activeIndex,
      ),
    );
    unmount();
  });

  it('should autocomplete on Enter when suggestions are active, without submitting', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'memory', value: 'memory' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/mem');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => {
      // The app should autocomplete the text, NOT submit.
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    });

    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should complete a command based on its altNames', async () => {
    props.slashCommands = [
      {
        name: 'help',
        altNames: ['?'],
        kind: CommandKind.BUILT_IN,
        description: '...',
      },
    ];

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'help', value: 'help' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/?');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\t'); // Press Tab for autocomplete
    });
    await waitFor(() =>
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0),
    );
    unmount();
  });

  it('should not submit on Enter when the buffer is empty or only contains whitespace', async () => {
    props.buffer.setText('   '); // Set buffer to whitespace

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r'); // Press Enter
    });

    await waitFor(() => {
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should submit directly on Enter when isPerfectMatch is true', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: false,
      isPerfectMatch: true,
    });
    props.buffer.setText('/clear');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('/clear'));
    unmount();
  });

  it('should execute perfect match on Enter even if suggestions are showing, if at first suggestion', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'review', value: 'review' }, // Match is now at index 0
        { label: 'review-frontend', value: 'review-frontend' },
      ],
      activeSuggestionIndex: 0,
      isPerfectMatch: true,
    });
    props.buffer.text = '/review';

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith('/review');
    });
    unmount();
  });

  it('should autocomplete and NOT execute on Enter if a DIFFERENT suggestion is selected even if perfect match', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'review', value: 'review' },
        { label: 'review-frontend', value: 'review-frontend' },
      ],
      activeSuggestionIndex: 1, // review-frontend selected (not the perfect match at 0)
      isPerfectMatch: true, // /review is a perfect match
    });
    props.buffer.text = '/review';

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      // Should handle autocomplete for index 1
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(1);
      // Should NOT submit
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should submit directly on Enter when a complete leaf command is typed', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: false,
      isPerfectMatch: false, // Added explicit isPerfectMatch false
    });
    props.buffer.setText('/clear');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('/clear'));
    unmount();
  });

  it('should submit on Enter when an @-path is a perfect match', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'file.txt', value: 'file.txt' }],
      activeSuggestionIndex: 0,
      isPerfectMatch: true,
      completionMode: CompletionMode.AT,
    });
    props.buffer.text = '@file.txt';

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      // Should submit directly
      expect(props.onSubmit).toHaveBeenCalledWith('@file.txt');
    });
    unmount();
  });

  it('should NOT submit on Shift+Enter even if an @-path is a perfect match', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'file.txt', value: 'file.txt' }],
      activeSuggestionIndex: 0,
      isPerfectMatch: true,
      completionMode: CompletionMode.AT,
    });
    props.buffer.text = '@file.txt';

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      // Simulate Shift+Enter using CSI u sequence
      stdin.write('\x1b[13;2u');
    });

    // Should NOT submit, should call newline instead
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(props.buffer.newline).toHaveBeenCalled();
    unmount();
  });

  it('should auto-execute commands with autoExecute: true on Enter', async () => {
    const aboutCommand: SlashCommand = {
      name: 'about',
      kind: CommandKind.BUILT_IN,
      description: 'About command',
      action: vi.fn(),
      autoExecute: true,
    };

    const suggestion = { label: 'about', value: 'about' };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCommandFromSuggestion: vi.fn().mockReturnValue(aboutCommand),
      getCompletedText: vi.fn().mockReturnValue('/about'),
      slashCompletionRange: {
        completionStart: 1,
        completionEnd: 3, // "/ab" -> start at 1, end at 3
        getCommandFromSuggestion: vi.fn(),
        isArgumentCompletion: false,
        leafCommand: null,
      },
    });

    // User typed partial command
    props.buffer.setText('/ab');
    props.buffer.lines = ['/ab'];
    props.buffer.cursor = [0, 3];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      // Should submit the full command constructed from buffer + suggestion
      expect(props.onSubmit).toHaveBeenCalledWith('/about');
      // Should NOT handle autocomplete (which just fills text)
      expect(mockCommandCompletion.handleAutocomplete).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should autocomplete commands with autoExecute: false on Enter', async () => {
    const shareCommand: SlashCommand = {
      name: 'share',
      kind: CommandKind.BUILT_IN,
      description: 'Share conversation to file',
      action: vi.fn(),
      autoExecute: false, // Explicitly set to false
    };

    const suggestion = { label: 'share', value: 'share' };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCommandFromSuggestion: vi.fn().mockReturnValue(shareCommand),
      getCompletedText: vi.fn().mockReturnValue('/share'),
    });

    props.buffer.setText('/sh');
    props.buffer.lines = ['/sh'];
    props.buffer.cursor = [0, 3];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      // Should autocomplete to allow adding file argument
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should autocomplete on Tab, even for executable commands', async () => {
    const executableCommand: SlashCommand = {
      name: 'about',
      kind: CommandKind.BUILT_IN,
      description: 'About info',
      action: vi.fn(),
      autoExecute: true,
    };

    const suggestion = { label: 'about', value: 'about' };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCommandFromSuggestion: vi.fn().mockReturnValue(executableCommand),
      getCompletedText: vi.fn().mockReturnValue('/about'),
    });

    props.buffer.setText('/ab');
    props.buffer.lines = ['/ab'];
    props.buffer.cursor = [0, 3];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\t'); // Tab
    });

    await waitFor(() => {
      // Tab always autocompletes, never executes
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should NOT autocomplete on Shift+Tab', async () => {
    const suggestion = { label: 'about', value: 'about' };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCompletedText: vi.fn().mockReturnValue('/about'),
    });

    props.buffer.setText('/ab');
    props.buffer.lines = ['/ab'];
    props.buffer.cursor = [0, 3];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\x1b[Z'); // Shift+Tab
    });

    // We need to wait a bit to ensure handleAutocomplete was NOT called
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockCommandCompletion.handleAutocomplete).not.toHaveBeenCalled();
    unmount();
  });

  it('should autocomplete custom commands from .toml files on Enter', async () => {
    const customCommand: SlashCommand = {
      name: 'find-capital',
      kind: CommandKind.FILE,
      description: 'Find capital of a country',
      action: vi.fn(),
      // No autoExecute flag - custom commands default to undefined
    };

    const suggestion = { label: 'find-capital', value: 'find-capital' };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCommandFromSuggestion: vi.fn().mockReturnValue(customCommand),
      getCompletedText: vi.fn().mockReturnValue('/find-capital'),
    });

    props.buffer.setText('/find');
    props.buffer.lines = ['/find'];
    props.buffer.cursor = [0, 5];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      // Should autocomplete (not execute) since autoExecute is undefined
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should auto-execute argument completion when command has autoExecute: true', async () => {
    // Simulates: /mcp auth <server> where user selects a server from completions
    const authCommand: SlashCommand = {
      name: 'auth',
      kind: CommandKind.BUILT_IN,
      description: 'Authenticate with MCP server',
      action: vi.fn(),
      autoExecute: true,
      completion: vi.fn().mockResolvedValue(['server1', 'server2']),
    };

    const suggestion = { label: 'server1', value: 'server1' };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCommandFromSuggestion: vi.fn().mockReturnValue(authCommand),
      getCompletedText: vi.fn().mockReturnValue('/mcp auth server1'),
      slashCompletionRange: {
        completionStart: 10,
        completionEnd: 10,
        getCommandFromSuggestion: vi.fn(),
        isArgumentCompletion: true,
        leafCommand: authCommand,
      },
    });

    props.buffer.setText('/mcp auth ');
    props.buffer.lines = ['/mcp auth '];
    props.buffer.cursor = [0, 10];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      // Should auto-execute with the completed command
      expect(props.onSubmit).toHaveBeenCalledWith('/mcp auth server1');
      expect(mockCommandCompletion.handleAutocomplete).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should autocomplete argument completion when command has autoExecute: false', async () => {
    // Simulates: /extensions enable <ext> where multi-arg completions should NOT auto-execute
    const enableCommand: SlashCommand = {
      name: 'enable',
      kind: CommandKind.BUILT_IN,
      description: 'Enable an extension',
      action: vi.fn(),
      autoExecute: false,
      completion: vi.fn().mockResolvedValue(['ext1 --scope user']),
    };

    const suggestion = {
      label: 'ext1 --scope user',
      value: 'ext1 --scope user',
    };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCommandFromSuggestion: vi.fn().mockReturnValue(enableCommand),
      getCompletedText: vi
        .fn()
        .mockReturnValue('/extensions enable ext1 --scope user'),
      slashCompletionRange: {
        completionStart: 19,
        completionEnd: 19,
        getCommandFromSuggestion: vi.fn(),
        isArgumentCompletion: true,
        leafCommand: enableCommand,
      },
    });

    props.buffer.setText('/extensions enable ');
    props.buffer.lines = ['/extensions enable '];
    props.buffer.cursor = [0, 19];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      // Should autocomplete (not execute) to allow user to modify
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should autocomplete command name even with autoExecute: true if command has completion function', async () => {
    // Simulates: /chat resu -> should NOT auto-execute, should autocomplete to show arg completions
    const resumeCommand: SlashCommand = {
      name: 'resume',
      kind: CommandKind.BUILT_IN,
      description: 'Resume a conversation',
      action: vi.fn(),
      autoExecute: true,
      completion: vi.fn().mockResolvedValue(['chat1', 'chat2']),
    };

    const suggestion = { label: 'resume', value: 'resume' };

    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [suggestion],
      activeSuggestionIndex: 0,
      getCommandFromSuggestion: vi.fn().mockReturnValue(resumeCommand),
      getCompletedText: vi.fn().mockReturnValue('/chat resume'),
      slashCompletionRange: {
        completionStart: 6,
        completionEnd: 10,
        getCommandFromSuggestion: vi.fn(),
        isArgumentCompletion: false,
        leafCommand: null,
      },
    });

    props.buffer.setText('/chat resu');
    props.buffer.lines = ['/chat resu'];
    props.buffer.cursor = [0, 10];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      // Should autocomplete to allow selecting an argument, NOT auto-execute
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should autocomplete an @-path on Enter without submitting', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'index.ts', value: 'index.ts' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('@src/components/');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() =>
      expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0),
    );
    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should add a newline on enter when the line ends with a backslash', async () => {
    // This test simulates multi-line input, not submission
    mockBuffer.text = 'first line\\';
    mockBuffer.cursor = [0, 11];
    mockBuffer.lines = ['first line\\'];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => {
      expect(props.buffer.backspace).toHaveBeenCalled();
      expect(props.buffer.newline).toHaveBeenCalled();
    });

    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should clear the buffer on Ctrl+C if it has text', async () => {
    await act(async () => {
      props.buffer.setText('some text to clear');
    });
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\x03'); // Ctrl+C character
    });
    await waitFor(() => {
      expect(props.buffer.setText).toHaveBeenCalledWith('');
      expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
    });
    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should render correctly in plan mode', async () => {
    props.approvalMode = ApprovalMode.PLAN;
    const { stdout, unmount } = renderWithProviders(<InputPrompt {...props} />);

    await waitFor(() => {
      const frame = stdout.lastFrame();
      // In plan mode it uses '>' but with success color.
      // We check that it contains '>' and not '*' or '!'.
      expect(frame).toContain('>');
      expect(frame).not.toContain('*');
      expect(frame).not.toContain('!');
    });
    unmount();
  });

  it('should NOT clear the buffer on Ctrl+C if it is empty', async () => {
    props.buffer.text = '';
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\x03'); // Ctrl+C character
    });

    await waitFor(() => {
      expect(props.buffer.setText).not.toHaveBeenCalled();
    });
    unmount();
  });

  it('should call setBannerVisible(false) when clear screen key is pressed', async () => {
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      uiActions,
    });

    await act(async () => {
      stdin.write('\x0C'); // Ctrl+L
    });

    await waitFor(() => {
      expect(props.setBannerVisible).toHaveBeenCalledWith(false);
    });
    unmount();
  });

  describe('Background Color Styles', () => {
    beforeEach(() => {
      vi.mocked(isLowColorDepth).mockReturnValue(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should render with background color by default', async () => {
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await waitFor(() => {
        const frame = stdout.lastFrame();
        expect(frame).toContain('▀');
        expect(frame).toContain('▄');
      });
      unmount();
    });

    it.each([
      { color: 'black', name: 'black' },
      { color: '#000000', name: '#000000' },
      { color: '#000', name: '#000' },
      { color: 'white', name: 'white' },
      { color: '#ffffff', name: '#ffffff' },
      { color: '#fff', name: '#fff' },
    ])(
      'should render with safe grey background but NO side borders in 8-bit mode when background is $name',
      async ({ color }) => {
        vi.mocked(isLowColorDepth).mockReturnValue(true);

        const { stdout, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
          {
            uiState: {
              terminalBackgroundColor: color,
            } as Partial<UIState>,
          },
        );

        const isWhite =
          color === 'white' || color === '#ffffff' || color === '#fff';
        const expectedBgColor = isWhite ? '#eeeeee' : '#1c1c1c';

        await waitFor(() => {
          const frame = stdout.lastFrame();

          // Use chalk to get the expected background color escape sequence
          const bgCheck = chalk.bgHex(expectedBgColor)(' ');
          const bgCode = bgCheck.substring(0, bgCheck.indexOf(' '));

          // Background color code should be present
          expect(frame).toContain(bgCode);
          // Background characters should be rendered
          expect(frame).toContain('▀');
          expect(frame).toContain('▄');
          // Side borders should STILL be removed
          expect(frame).not.toContain('│');
        });

        unmount();
      },
    );

    it('should NOT render with background color but SHOULD render horizontal lines when color depth is < 24 and background is NOT black', async () => {
      vi.mocked(isLowColorDepth).mockReturnValue(true);

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiState: {
            terminalBackgroundColor: '#333333',
          } as Partial<UIState>,
        },
      );

      await waitFor(() => {
        const frame = stdout.lastFrame();
        expect(frame).not.toContain('▀');
        expect(frame).not.toContain('▄');
        // It SHOULD have horizontal fallback lines
        expect(frame).toContain('─');
        // It SHOULD NOT have vertical side borders (standard Box borders have │)
        expect(frame).not.toContain('│');
      });
      unmount();
    });
    it('should handle 4-bit color mode (16 colors) as low color depth', async () => {
      vi.mocked(isLowColorDepth).mockReturnValue(true);

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiState: {
            terminalBackgroundColor: 'black',
          } as Partial<UIState>,
        },
      );

      await waitFor(() => {
        const frame = stdout.lastFrame();

        expect(frame).toContain('▀');

        expect(frame).not.toContain('│');
      });

      unmount();
    });

    it('should render horizontal lines (but NO background) in 8-bit mode when background is blue', async () => {
      vi.mocked(isLowColorDepth).mockReturnValue(true);

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,

        {
          uiState: {
            terminalBackgroundColor: 'blue',
          } as Partial<UIState>,
        },
      );

      await waitFor(() => {
        const frame = stdout.lastFrame();

        // Should NOT have background characters

        expect(frame).not.toContain('▀');

        expect(frame).not.toContain('▄');

        // Should HAVE horizontal lines from the fallback Box borders

        // Box style "round" uses these for top/bottom

        expect(frame).toContain('─');

        // Should NOT have vertical side borders

        expect(frame).not.toContain('│');
      });

      unmount();
    });

    it('should render with plain borders when useBackgroundColor is false', async () => {
      props.config.getUseBackgroundColor = () => false;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await waitFor(() => {
        const frame = stdout.lastFrame();
        expect(frame).not.toContain('▀');
        expect(frame).not.toContain('▄');
        // Check for Box borders (round style uses unicode box chars)
        expect(frame).toMatch(/[─│┐└┘┌]/);
      });
      unmount();
    });
  });

  describe('cursor-based completion trigger', () => {
    it.each([
      {
        name: 'should trigger completion when cursor is after @ without spaces',
        text: '@src/components',
        cursor: [0, 15],
        showSuggestions: true,
      },
      {
        name: 'should trigger completion when cursor is after / without spaces',
        text: '/memory',
        cursor: [0, 7],
        showSuggestions: true,
      },
      {
        name: 'should NOT trigger completion when cursor is after space following @',
        text: '@src/file.ts hello',
        cursor: [0, 18],
        showSuggestions: false,
      },
      {
        name: 'should NOT trigger completion when cursor is after space following /',
        text: '/memory add',
        cursor: [0, 11],
        showSuggestions: false,
      },
      {
        name: 'should NOT trigger completion when cursor is not after @ or /',
        text: 'hello world',
        cursor: [0, 5],
        showSuggestions: false,
      },
      {
        name: 'should handle multiline text correctly',
        text: 'first line\n/memory',
        cursor: [1, 7],
        showSuggestions: false,
      },
      {
        name: 'should handle Unicode characters (emojis) correctly in paths',
        text: '@src/file👍.txt',
        cursor: [0, 14],
        showSuggestions: true,
      },
      {
        name: 'should handle Unicode characters with spaces after them',
        text: '@src/file👍.txt hello',
        cursor: [0, 20],
        showSuggestions: false,
      },
      {
        name: 'should handle escaped spaces in paths correctly',
        text: '@src/my\\ file.txt',
        cursor: [0, 16],
        showSuggestions: true,
      },
      {
        name: 'should NOT trigger completion after unescaped space following escaped space',
        text: '@path/my\\ file.txt hello',
        cursor: [0, 24],
        showSuggestions: false,
      },
      {
        name: 'should handle multiple escaped spaces in paths',
        text: '@docs/my\\ long\\ file\\ name.md',
        cursor: [0, 29],
        showSuggestions: true,
      },
      {
        name: 'should handle escaped spaces in slash commands',
        text: '/memory\\ test',
        cursor: [0, 13],
        showSuggestions: true,
      },
      {
        name: 'should handle Unicode characters with escaped spaces',
        text: `@${path.join('files', 'emoji\\ 👍\\ test.txt')}`,
        cursor: [0, 25],
        showSuggestions: true,
      },
    ])('$name', async ({ text, cursor, showSuggestions }) => {
      mockBuffer.text = text;
      mockBuffer.lines = text.split('\n');
      mockBuffer.cursor = cursor as [number, number];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions,
        suggestions: showSuggestions
          ? [{ label: 'suggestion', value: 'suggestion' }]
          : [],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />, {
        uiActions,
      });

      await waitFor(() => {
        expect(mockedUseCommandCompletion).toHaveBeenCalledWith({
          buffer: mockBuffer,
          cwd: path.join('test', 'project', 'src'),
          slashCommands: mockSlashCommands,
          commandContext: mockCommandContext,
          reverseSearchActive: false,
          shellModeActive: false,
          config: expect.any(Object),
          active: expect.anything(),
        });
      });

      unmount();
    });
  });

  describe('vim mode', () => {
    it.each([
      {
        name: 'should not call buffer.handleInput when vim handles input',
        vimHandled: true,
        expectBufferHandleInput: false,
      },
      {
        name: 'should call buffer.handleInput when vim does not handle input',
        vimHandled: false,
        expectBufferHandleInput: true,
      },
      {
        name: 'should call handleInput when vim mode is disabled',
        vimHandled: false,
        expectBufferHandleInput: true,
      },
    ])('$name', async ({ vimHandled, expectBufferHandleInput }) => {
      props.vimHandleInput = vi.fn().mockReturnValue(vimHandled);
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => stdin.write('i'));
      await waitFor(() => {
        expect(props.vimHandleInput).toHaveBeenCalled();
        if (expectBufferHandleInput) {
          expect(mockBuffer.handleInput).toHaveBeenCalled();
        } else {
          expect(mockBuffer.handleInput).not.toHaveBeenCalled();
        }
      });
      unmount();
    });
  });

  describe('unfocused paste', () => {
    it('should handle bracketed paste when not focused', async () => {
      props.focus = false;
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x1B[200~pasted text\x1B[201~');
      });
      await waitFor(() => {
        expect(mockBuffer.handleInput).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'paste',
            sequence: 'pasted text',
          }),
        );
      });
      unmount();
    });

    it('should ignore regular keypresses when not focused', async () => {
      props.focus = false;
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('a');
      });
      await waitFor(() => {});

      expect(mockBuffer.handleInput).not.toHaveBeenCalled();
      unmount();
    });
  });

  describe('Highlighting and Cursor Display', () => {
    describe('single-line scenarios', () => {
      it.each([
        {
          name: 'mid-word',
          text: 'hello world',
          visualCursor: [0, 3],
          expected: `hel${chalk.inverse('l')}o world`,
        },
        {
          name: 'at the beginning of the line',
          text: 'hello',
          visualCursor: [0, 0],
          expected: `${chalk.inverse('h')}ello`,
        },
        {
          name: 'at the end of the line',
          text: 'hello',
          visualCursor: [0, 5],
          expected: `hello${chalk.inverse(' ')}`,
        },
        {
          name: 'on a highlighted token',
          text: 'run @path/to/file',
          visualCursor: [0, 9],
          expected: `@path/${chalk.inverse('t')}o/file`,
        },
        {
          name: 'for multi-byte unicode characters',
          text: 'hello 👍 world',
          visualCursor: [0, 6],
          expected: `hello ${chalk.inverse('👍')} world`,
        },
        {
          name: 'after multi-byte unicode characters',
          text: '👍A',
          visualCursor: [0, 1],
          expected: `👍${chalk.inverse('A')}`,
        },
        {
          name: 'at the end of a line with unicode characters',
          text: 'hello 👍',
          visualCursor: [0, 8],
          expected: `hello 👍${chalk.inverse(' ')}`,
        },
        {
          name: 'at the end of a short line with unicode characters',
          text: '👍',
          visualCursor: [0, 1],
          expected: `👍${chalk.inverse(' ')}`,
        },
        {
          name: 'on an empty line',
          text: '',
          visualCursor: [0, 0],
          expected: chalk.inverse(' '),
        },
        {
          name: 'on a space between words',
          text: 'hello world',
          visualCursor: [0, 5],
          expected: `hello${chalk.inverse(' ')}world`,
        },
      ])(
        'should display cursor correctly $name',
        async ({ text, visualCursor, expected }) => {
          mockBuffer.text = text;
          mockBuffer.lines = [text];
          mockBuffer.viewportVisualLines = [text];
          mockBuffer.visualCursor = visualCursor as [number, number];
          props.config.getUseBackgroundColor = () => false;

          const { stdout, unmount } = renderWithProviders(
            <InputPrompt {...props} />,
          );
          await waitFor(() => {
            const frame = stdout.lastFrame();
            expect(frame).toContain(expected);
          });
          unmount();
        },
      );
    });

    describe('multi-line scenarios', () => {
      it.each([
        {
          name: 'in the middle of a line',
          text: 'first line\nsecond line\nthird line',
          visualCursor: [1, 3],
          visualToLogicalMap: [
            [0, 0],
            [1, 0],
            [2, 0],
          ],
          expected: `sec${chalk.inverse('o')}nd line`,
        },
        {
          name: 'at the beginning of a line',
          text: 'first line\nsecond line',
          visualCursor: [1, 0],
          visualToLogicalMap: [
            [0, 0],
            [1, 0],
          ],
          expected: `${chalk.inverse('s')}econd line`,
        },
        {
          name: 'at the end of a line',
          text: 'first line\nsecond line',
          visualCursor: [0, 10],
          visualToLogicalMap: [
            [0, 0],
            [1, 0],
          ],
          expected: `first line${chalk.inverse(' ')}`,
        },
      ])(
        'should display cursor correctly $name in a multiline block',
        async ({ text, visualCursor, expected, visualToLogicalMap }) => {
          mockBuffer.text = text;
          mockBuffer.lines = text.split('\n');
          mockBuffer.viewportVisualLines = text.split('\n');
          mockBuffer.visualCursor = visualCursor as [number, number];
          mockBuffer.visualToLogicalMap = visualToLogicalMap as Array<
            [number, number]
          >;
          props.config.getUseBackgroundColor = () => false;

          const { stdout, unmount } = renderWithProviders(
            <InputPrompt {...props} />,
          );
          await waitFor(() => {
            const frame = stdout.lastFrame();
            expect(frame).toContain(expected);
          });
          unmount();
        },
      );

      it('should display cursor on a blank line in a multiline block', async () => {
        const text = 'first line\n\nthird line';
        mockBuffer.text = text;
        mockBuffer.lines = text.split('\n');
        mockBuffer.viewportVisualLines = text.split('\n');
        mockBuffer.visualCursor = [1, 0]; // cursor on the blank line
        mockBuffer.visualToLogicalMap = [
          [0, 0],
          [1, 0],
          [2, 0],
        ];
        props.config.getUseBackgroundColor = () => false;

        const { stdout, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
        );
        await waitFor(() => {
          const frame = stdout.lastFrame();
          const lines = frame.split('\n');
          // The line with the cursor should just be an inverted space inside the box border
          expect(
            lines.find((l) => l.includes(chalk.inverse(' '))),
          ).not.toBeUndefined();
        });
        unmount();
      });
    });
  });

  describe('multiline rendering', () => {
    it('should correctly render multiline input including blank lines', async () => {
      const text = 'hello\n\nworld';
      mockBuffer.text = text;
      mockBuffer.lines = text.split('\n');
      mockBuffer.viewportVisualLines = text.split('\n');
      mockBuffer.allVisualLines = text.split('\n');
      mockBuffer.visualCursor = [2, 5]; // cursor at the end of "world"
      // Provide a visual-to-logical mapping for each visual line
      mockBuffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
        [2, 0],
      ];
      props.config.getUseBackgroundColor = () => false;

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => {
        const frame = stdout.lastFrame();
        // Check that all lines, including the empty one, are rendered.
        // This implicitly tests that the Box wrapper provides height for the empty line.
        expect(frame).toContain('hello');
        expect(frame).toContain(`world${chalk.inverse(' ')}`);

        const outputLines = frame.trim().split('\n');
        // The number of lines should be 2 for the border plus 3 for the content.
        expect(outputLines.length).toBe(5);
      });
      unmount();
    });
  });

  describe('multiline paste', () => {
    it.each([
      {
        description: 'with \n newlines',
        pastedText: 'This \n is \n a \n multiline \n paste.',
      },
      {
        description: 'with extra slashes before \n newlines',
        pastedText: 'This \\\n is \\\n a \\\n multiline \\\n paste.',
      },
      {
        description: 'with \r\n newlines',
        pastedText: 'This\r\nis\r\na\r\nmultiline\r\npaste.',
      },
    ])('should handle multiline paste $description', async ({ pastedText }) => {
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      // Simulate a bracketed paste event from the terminal
      await act(async () => {
        stdin.write(`\x1b[200~${pastedText}\x1b[201~`);
      });
      await waitFor(() => {
        // Verify that the buffer's handleInput was called once with the full text
        expect(props.buffer.handleInput).toHaveBeenCalledTimes(1);
        expect(props.buffer.handleInput).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'paste',
            sequence: pastedText,
          }),
        );
      });

      unmount();
    });
  });

  describe('large paste placeholder', () => {
    it('should handle large clipboard paste (lines > 5) by calling buffer.insert', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
      const largeText = '1\n2\n3\n4\n5\n6';
      vi.mocked(clipboardy.read).mockResolvedValue(largeText);

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });

      await waitFor(() => {
        expect(mockBuffer.insert).toHaveBeenCalledWith(
          largeText,
          expect.objectContaining({ paste: true }),
        );
      });

      unmount();
    });

    it('should handle large clipboard paste (chars > 500) by calling buffer.insert', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
      const largeText = 'a'.repeat(501);
      vi.mocked(clipboardy.read).mockResolvedValue(largeText);

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });

      await waitFor(() => {
        expect(mockBuffer.insert).toHaveBeenCalledWith(
          largeText,
          expect.objectContaining({ paste: true }),
        );
      });

      unmount();
    });

    it('should handle normal clipboard paste by calling buffer.insert', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
      const smallText = 'hello world';
      vi.mocked(clipboardy.read).mockResolvedValue(smallText);

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x16'); // Ctrl+V
      });

      await waitFor(() => {
        expect(mockBuffer.insert).toHaveBeenCalledWith(
          smallText,
          expect.objectContaining({ paste: true }),
        );
      });

      unmount();
    });

    it('should replace placeholder with actual content on submit', async () => {
      // Setup buffer to have the placeholder
      const largeText = '1\n2\n3\n4\n5\n6';
      const id = '[Pasted Text: 6 lines]';
      mockBuffer.text = `Check this: ${id}`;
      mockBuffer.pastedContent = { [id]: largeText };

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\r'); // Enter
      });

      await waitFor(() => {
        expect(props.onSubmit).toHaveBeenCalledWith(`Check this: ${largeText}`);
      });

      unmount();
    });
  });

  describe('paste auto-submission protection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockedUseKittyKeyboardProtocol.mockReturnValue({
        enabled: false,
        checking: false,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should prevent auto-submission immediately after an unsafe paste', async () => {
      // isTerminalPasteTrusted will be false due to beforeEach setup.
      props.buffer.text = 'some command';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Simulate a paste operation (this should set the paste protection)
      await act(async () => {
        stdin.write(`\x1b[200~pasted content\x1b[201~`);
      });

      // Simulate an Enter key press immediately after paste
      await act(async () => {
        stdin.write('\r');
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Verify that onSubmit was NOT called due to recent paste protection
      expect(props.onSubmit).not.toHaveBeenCalled();
      // It should call newline() instead
      expect(props.buffer.newline).toHaveBeenCalled();
      unmount();
    });

    it('should prevent perfect match auto-submission immediately after an unsafe paste', async () => {
      // isTerminalPasteTrusted will be false due to beforeEach setup.
      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        isPerfectMatch: true,
        completionMode: CompletionMode.AT,
      });
      props.buffer.text = '@file.txt';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      // Simulate an unsafe paste of a perfect match
      await act(async () => {
        stdin.write(`\x1b[200~@file.txt\x1b[201~`);
      });

      // Simulate an Enter key press immediately after paste
      await act(async () => {
        stdin.write('\r');
      });

      // Verify that onSubmit was NOT called due to recent paste protection
      expect(props.onSubmit).not.toHaveBeenCalled();
      // It should call newline() instead
      expect(props.buffer.newline).toHaveBeenCalled();
      unmount();
    });

    it('should allow submission after unsafe paste protection timeout', async () => {
      // isTerminalPasteTrusted will be false due to beforeEach setup.
      props.buffer.text = 'pasted text';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Simulate a paste operation (this sets the protection)
      await act(async () => {
        stdin.write('\x1b[200~pasted text\x1b[201~');
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Advance timers past the protection timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Now Enter should work normally
      await act(async () => {
        stdin.write('\r');
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(props.onSubmit).toHaveBeenCalledWith('pasted text');
      expect(props.buffer.newline).not.toHaveBeenCalled();

      unmount();
    });

    it.each([
      {
        name: 'kitty',
        setup: () =>
          mockedUseKittyKeyboardProtocol.mockReturnValue({
            enabled: true,
            checking: false,
          }),
      },
    ])(
      'should allow immediate submission for a trusted paste ($name)',
      async ({ setup }) => {
        setup();
        props.buffer.text = 'pasted command';

        const { stdin, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
        );
        await act(async () => {
          await vi.runAllTimersAsync();
        });

        // Simulate a paste operation
        await act(async () => {
          stdin.write('\x1b[200~some pasted stuff\x1b[201~');
        });
        await act(async () => {
          await vi.runAllTimersAsync();
        });

        // Simulate an Enter key press immediately after paste
        await act(async () => {
          stdin.write('\r');
        });
        await act(async () => {
          await vi.runAllTimersAsync();
        });

        // Verify that onSubmit was called
        expect(props.onSubmit).toHaveBeenCalledWith('pasted command');
        unmount();
      },
    );

    it('should not interfere with normal Enter key submission when no recent paste', async () => {
      // Set up buffer with text before rendering to ensure submission works
      props.buffer.text = 'normal command';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Press Enter without any recent paste
      await act(async () => {
        stdin.write('\r');
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Verify that onSubmit was called normally
      expect(props.onSubmit).toHaveBeenCalledWith('normal command');

      unmount();
    });
  });

  describe('enhanced input UX - keyboard shortcuts', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('should clear buffer on Ctrl-C', async () => {
      const onEscapePromptChange = vi.fn();
      props.onEscapePromptChange = onEscapePromptChange;
      props.buffer.setText('text to clear');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x03');
        vi.advanceTimersByTime(100);

        expect(props.buffer.setText).toHaveBeenCalledWith('');
        expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
      });
      unmount();
    });

    it('should submit /rewind on double ESC when buffer is empty', async () => {
      const onEscapePromptChange = vi.fn();
      props.onEscapePromptChange = onEscapePromptChange;
      props.buffer.setText('');
      vi.mocked(props.buffer.setText).mockClear();

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiState: {
            history: [{ id: 1, type: 'user', text: 'test' }],
          },
        },
      );

      await act(async () => {
        stdin.write('\x1B\x1B');
        vi.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(props.onSubmit).toHaveBeenCalledWith('/rewind');
      });
      unmount();
    });

    it('should clear the buffer on esc esc if it has text', async () => {
      const onEscapePromptChange = vi.fn();
      props.onEscapePromptChange = onEscapePromptChange;
      props.buffer.setText('some text');
      vi.mocked(props.buffer.setText).mockClear();

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x1B\x1B');
        vi.advanceTimersByTime(100);

        expect(props.buffer.setText).toHaveBeenCalledWith('');
        expect(props.onSubmit).not.toHaveBeenCalledWith('/rewind');
      });
      unmount();
    });

    it('should reset escape state on any non-ESC key', async () => {
      const onEscapePromptChange = vi.fn();
      props.onEscapePromptChange = onEscapePromptChange;
      props.buffer.setText('some text');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x1B');
        await waitFor(() => {
          expect(onEscapePromptChange).toHaveBeenCalledWith(false);
        });
      });

      await act(async () => {
        stdin.write('a');
        await waitFor(() => {
          expect(onEscapePromptChange).toHaveBeenCalledWith(false);
        });
      });
      unmount();
    });

    it('should handle ESC in shell mode by disabling shell mode', async () => {
      props.shellModeActive = true;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x1B');
        vi.advanceTimersByTime(100);

        expect(props.setShellModeActive).toHaveBeenCalledWith(false);
      });
      unmount();
    });

    it('should handle ESC when completion suggestions are showing', async () => {
      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'suggestion', value: 'suggestion' }],
      });

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x1B');

        vi.advanceTimersByTime(100);
        expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
      });
      unmount();
    });

    it('should not call onEscapePromptChange when not provided', async () => {
      props.onEscapePromptChange = undefined;
      props.buffer.setText('some text');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      await act(async () => {
        stdin.write('\x1B');
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      unmount();
    });

    it('should not interfere with existing keyboard shortcuts', async () => {
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x0C');
      });
      await waitFor(() => expect(props.onClearScreen).toHaveBeenCalled());

      await act(async () => {
        stdin.write('\x01');
      });
      await waitFor(() =>
        expect(props.buffer.move).toHaveBeenCalledWith('home'),
      );
      unmount();
    });
  });

  describe('reverse search', () => {
    beforeEach(async () => {
      props.shellModeActive = true;

      vi.mocked(useShellHistory).mockReturnValue({
        history: ['echo hello', 'echo world', 'ls'],
        getPreviousCommand: vi.fn(),
        getNextCommand: vi.fn(),
        addCommandToHistory: vi.fn(),
        resetHistoryPosition: vi.fn(),
      });
    });

    it('invokes reverse search on Ctrl+R', async () => {
      // Mock the reverse search completion to return suggestions
      mockedUseReverseSearchCompletion.mockReturnValue({
        ...mockReverseSearchCompletion,
        suggestions: [
          { label: 'echo hello', value: 'echo hello' },
          { label: 'echo world', value: 'echo world' },
          { label: 'ls', value: 'ls' },
        ],
        showSuggestions: true,
        activeSuggestionIndex: 0,
      });

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      // Trigger reverse search with Ctrl+R
      await act(async () => {
        stdin.write('\x12');
      });

      await waitFor(() => {
        const frame = stdout.lastFrame();
        expect(frame).toContain('(r:)');
        expect(frame).toContain('echo hello');
        expect(frame).toContain('echo world');
        expect(frame).toContain('ls');
      });

      unmount();
    });

    it.each([
      { name: 'standard', escapeSequence: '\x1B' },
      { name: 'kitty', escapeSequence: '\u001b[27u' },
    ])(
      'resets reverse search state on Escape ($name)',
      async ({ escapeSequence }) => {
        const { stdin, stdout, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
        );

        await act(async () => {
          stdin.write('\x12');
        });

        // Wait for reverse search to be active
        await waitFor(() => {
          expect(stdout.lastFrame()).toContain('(r:)');
        });

        await act(async () => {
          stdin.write(escapeSequence);
        });

        await waitFor(() => {
          expect(stdout.lastFrame()).not.toContain('(r:)');
          expect(stdout.lastFrame()).not.toContain('echo hello');
        });

        unmount();
      },
    );

    it('completes the highlighted entry on Tab and exits reverse-search', async () => {
      // Mock the reverse search completion
      const mockHandleAutocomplete = vi.fn(() => {
        props.buffer.setText('echo hello');
      });

      mockedUseReverseSearchCompletion.mockImplementation(
        (buffer, shellHistory, reverseSearchActive) => ({
          ...mockReverseSearchCompletion,
          suggestions: reverseSearchActive
            ? [
                { label: 'echo hello', value: 'echo hello' },
                { label: 'echo world', value: 'echo world' },
                { label: 'ls', value: 'ls' },
              ]
            : [],
          showSuggestions: reverseSearchActive,
          activeSuggestionIndex: reverseSearchActive ? 0 : -1,
          handleAutocomplete: mockHandleAutocomplete,
        }),
      );

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      // Enter reverse search mode with Ctrl+R
      await act(async () => {
        stdin.write('\x12');
      });

      // Verify reverse search is active
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('(r:)');
      });

      // Press Tab to complete the highlighted entry
      await act(async () => {
        stdin.write('\t');
      });
      await waitFor(() => {
        expect(mockHandleAutocomplete).toHaveBeenCalledWith(0);
        expect(props.buffer.setText).toHaveBeenCalledWith('echo hello');
      });
      unmount();
    }, 15000);

    it('should NOT autocomplete on Shift+Tab in reverse search', async () => {
      const mockHandleAutocomplete = vi.fn();

      mockedUseReverseSearchCompletion.mockReturnValue({
        ...mockReverseSearchCompletion,
        suggestions: [{ label: 'echo hello', value: 'echo hello' }],
        showSuggestions: true,
        activeSuggestionIndex: 0,
        handleAutocomplete: mockHandleAutocomplete,
      });

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
        },
      );

      await act(async () => {
        stdin.write('\x12'); // Ctrl+R
      });

      await act(async () => {
        stdin.write('\x1b[Z'); // Shift+Tab
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockHandleAutocomplete).not.toHaveBeenCalled();
      unmount();
    });

    it('submits the highlighted entry on Enter and exits reverse-search', async () => {
      // Mock the reverse search completion to return suggestions
      mockedUseReverseSearchCompletion.mockReturnValue({
        ...mockReverseSearchCompletion,
        suggestions: [
          { label: 'echo hello', value: 'echo hello' },
          { label: 'echo world', value: 'echo world' },
          { label: 'ls', value: 'ls' },
        ],
        showSuggestions: true,
        activeSuggestionIndex: 0,
      });

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x12');
      });

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('(r:)');
      });

      await act(async () => {
        stdin.write('\r');
      });

      await waitFor(() => {
        expect(stdout.lastFrame()).not.toContain('(r:)');
      });

      expect(props.onSubmit).toHaveBeenCalledWith('echo hello');
      unmount();
    });

    it('should restore text and cursor position after reverse search"', async () => {
      const initialText = 'initial text';
      const initialCursor: [number, number] = [0, 3];

      props.buffer.setText(initialText);
      props.buffer.cursor = initialCursor;

      // Mock the reverse search completion to be active and then reset
      mockedUseReverseSearchCompletion.mockImplementation(
        (buffer, shellHistory, reverseSearchActiveFromInputPrompt) => ({
          ...mockReverseSearchCompletion,
          suggestions: reverseSearchActiveFromInputPrompt
            ? [{ label: 'history item', value: 'history item' }]
            : [],
          showSuggestions: reverseSearchActiveFromInputPrompt,
        }),
      );

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      // reverse search with Ctrl+R
      await act(async () => {
        stdin.write('\x12');
      });

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('(r:)');
      });

      // Press kitty escape key
      await act(async () => {
        stdin.write('\u001b[27u');
      });

      await waitFor(() => {
        expect(stdout.lastFrame()).not.toContain('(r:)');
        expect(props.buffer.text).toBe(initialText);
        expect(props.buffer.cursor).toEqual(initialCursor);
      });

      unmount();
    });
  });

  describe('Ctrl+E keyboard shortcut', () => {
    it('should move cursor to end of current line in multiline input', async () => {
      props.buffer.text = 'line 1\nline 2\nline 3';
      props.buffer.cursor = [1, 2];
      props.buffer.lines = ['line 1', 'line 2', 'line 3'];

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x05'); // Ctrl+E
      });
      await waitFor(() => {
        expect(props.buffer.move).toHaveBeenCalledWith('end');
      });
      expect(props.buffer.moveToOffset).not.toHaveBeenCalled();
      unmount();
    });

    it('should move cursor to end of current line for single line input', async () => {
      props.buffer.text = 'single line text';
      props.buffer.cursor = [0, 5];
      props.buffer.lines = ['single line text'];

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x05'); // Ctrl+E
      });
      await waitFor(() => {
        expect(props.buffer.move).toHaveBeenCalledWith('end');
      });
      expect(props.buffer.moveToOffset).not.toHaveBeenCalled();
      unmount();
    });
  });

  describe('command search (Ctrl+R when not in shell)', () => {
    it('enters command search on Ctrl+R and shows suggestions', async () => {
      props.shellModeActive = false;

      vi.mocked(useReverseSearchCompletion).mockImplementation(
        (buffer, data, isActive) => ({
          ...mockReverseSearchCompletion,
          suggestions: isActive
            ? [
                { label: 'git commit -m "msg"', value: 'git commit -m "msg"' },
                { label: 'git push', value: 'git push' },
              ]
            : [],
          showSuggestions: !!isActive,
          activeSuggestionIndex: isActive ? 0 : -1,
        }),
      );

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x12'); // Ctrl+R
      });

      await waitFor(() => {
        const frame = stdout.lastFrame() ?? '';
        expect(frame).toContain('(r:)');
        expect(frame).toContain('git commit');
        expect(frame).toContain('git push');
      });
      unmount();
    });

    it('expands and collapses long suggestion via Right/Left arrows', async () => {
      props.shellModeActive = false;
      const longValue = 'l'.repeat(200);

      vi.mocked(useReverseSearchCompletion).mockReturnValue({
        ...mockReverseSearchCompletion,
        suggestions: [{ label: longValue, value: longValue, matchedIndex: 0 }],
        showSuggestions: true,
        activeSuggestionIndex: 0,
        visibleStartIndex: 0,
        isLoadingSuggestions: false,
      });

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x12');
      });
      await waitFor(() => {
        expect(clean(stdout.lastFrame())).toContain('→');
      });

      await act(async () => {
        stdin.write('\u001B[C');
      });
      await waitFor(() => {
        expect(clean(stdout.lastFrame())).toContain('←');
      });
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-render-expanded-match',
      );

      await act(async () => {
        stdin.write('\u001B[D');
      });
      await waitFor(() => {
        expect(clean(stdout.lastFrame())).toContain('→');
      });
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-render-collapsed-match',
      );
      unmount();
    });

    it('renders match window and expanded view (snapshots)', async () => {
      props.shellModeActive = false;
      props.buffer.setText('commit');

      const label = 'git commit -m "feat: add search" in src/app';
      const matchedIndex = label.indexOf('commit');

      vi.mocked(useReverseSearchCompletion).mockReturnValue({
        ...mockReverseSearchCompletion,
        suggestions: [{ label, value: label, matchedIndex }],
        showSuggestions: true,
        activeSuggestionIndex: 0,
        visibleStartIndex: 0,
        isLoadingSuggestions: false,
      });

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x12');
      });
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('(r:)');
      });
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-render-collapsed-match',
      );

      await act(async () => {
        stdin.write('\u001B[C');
      });
      await waitFor(() => {
        // Just wait for any update to ensure it is stable.
        // We could also wait for specific text if we knew it.
        expect(stdout.lastFrame()).toContain('(r:)');
      });
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-render-expanded-match',
      );
      unmount();
    });

    it('does not show expand/collapse indicator for short suggestions', async () => {
      props.shellModeActive = false;
      const shortValue = 'echo hello';

      vi.mocked(useReverseSearchCompletion).mockReturnValue({
        ...mockReverseSearchCompletion,
        suggestions: [{ label: shortValue, value: shortValue }],
        showSuggestions: true,
        activeSuggestionIndex: 0,
        visibleStartIndex: 0,
        isLoadingSuggestions: false,
      });

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\x12');
      });
      await waitFor(() => {
        const frame = clean(stdout.lastFrame());
        // Ensure it rendered the search mode
        expect(frame).toContain('(r:)');
        expect(frame).not.toContain('→');
        expect(frame).not.toContain('←');
      });
      unmount();
    });

    it('ensures Ctrl+R search results are prioritized newest-to-oldest by reversing userMessages', async () => {
      props.shellModeActive = false;
      props.userMessages = ['oldest', 'middle', 'newest'];

      renderWithProviders(<InputPrompt {...props} />);

      const calls = vi.mocked(useReverseSearchCompletion).mock.calls;
      const commandSearchCall = calls.find(
        (call) =>
          call[1] === props.userMessages ||
          (Array.isArray(call[1]) && call[1][0] === 'newest'),
      );

      expect(commandSearchCall).toBeDefined();
      expect(commandSearchCall![1]).toEqual(['newest', 'middle', 'oldest']);
    });
  });

  describe('Tab clean UI toggle', () => {
    it.each([
      {
        name: 'should toggle clean UI details on double-Tab when no suggestions or ghost text',
        showSuggestions: false,
        ghostText: '',
        suggestions: [],
        expectedUiToggle: true,
      },
      {
        name: 'should accept ghost text and NOT toggle clean UI details on Tab',
        showSuggestions: false,
        ghostText: 'ghost text',
        suggestions: [],
        expectedUiToggle: false,
        expectedAcceptCall: true,
      },
      {
        name: 'should NOT toggle clean UI details on Tab when suggestions are present',
        showSuggestions: true,
        ghostText: '',
        suggestions: [{ label: 'test', value: 'test' }],
        expectedUiToggle: false,
      },
    ])(
      '$name',
      async ({
        showSuggestions,
        ghostText,
        suggestions,
        expectedUiToggle,
        expectedAcceptCall,
      }) => {
        const mockAccept = vi.fn();
        mockedUseCommandCompletion.mockReturnValue({
          ...mockCommandCompletion,
          showSuggestions,
          suggestions,
          promptCompletion: {
            text: ghostText,
            accept: mockAccept,
            clear: vi.fn(),
            isLoading: false,
            isActive: ghostText !== '',
            markSelected: vi.fn(),
          },
        });

        const { stdin, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
          {
            uiActions,
            uiState: {},
          },
        );

        await act(async () => {
          stdin.write('\t');
          if (expectedUiToggle) {
            stdin.write('\t');
          }
        });

        await waitFor(() => {
          if (expectedUiToggle) {
            expect(uiActions.toggleCleanUiDetailsVisible).toHaveBeenCalled();
          } else {
            expect(
              uiActions.toggleCleanUiDetailsVisible,
            ).not.toHaveBeenCalled();
          }

          if (expectedAcceptCall) {
            expect(mockAccept).toHaveBeenCalled();
          }
        });
        unmount();
      },
    );

    it('should NOT accept ghost text on Shift+Tab', async () => {
      const mockAccept = vi.fn();
      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
        promptCompletion: {
          text: 'ghost text',
          accept: mockAccept,
          clear: vi.fn(),
          isLoading: false,
          isActive: true,
          markSelected: vi.fn(),
        },
      });

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
        },
      );

      await act(async () => {
        stdin.write('\x1b[Z'); // Shift+Tab
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAccept).not.toHaveBeenCalled();
      unmount();
    });

    it('should not reveal clean UI details on Shift+Tab when hidden', async () => {
      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
        promptCompletion: {
          text: '',
          accept: vi.fn(),
          clear: vi.fn(),
          isLoading: false,
          isActive: false,
          markSelected: vi.fn(),
        },
      });

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
          uiState: { activePtyId: 1, cleanUiDetailsVisible: false },
        },
      );

      await act(async () => {
        stdin.write('\x1b[Z');
      });

      await waitFor(() => {
        expect(
          uiActions.revealCleanUiDetailsTemporarily,
        ).not.toHaveBeenCalled();
      });
      unmount();
    });

    it('should toggle clean UI details on double-Tab by default', async () => {
      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
        promptCompletion: {
          text: '',
          accept: vi.fn(),
          clear: vi.fn(),
          isLoading: false,
          isActive: false,
          markSelected: vi.fn(),
        },
      });

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          uiActions,
          uiState: {},
        },
      );

      await act(async () => {
        stdin.write('\t');
        stdin.write('\t');
      });

      await waitFor(() => {
        expect(uiActions.toggleCleanUiDetailsVisible).toHaveBeenCalled();
      });
      unmount();
    });
  });

  describe('mouse interaction', () => {
    it.each([
      {
        name: 'first line, first char',
        relX: 0,
        relY: 0,
        mouseCol: 4,
        mouseRow: 2,
      },
      {
        name: 'first line, middle char',
        relX: 6,
        relY: 0,
        mouseCol: 10,
        mouseRow: 2,
      },
      {
        name: 'second line, first char',
        relX: 0,
        relY: 1,
        mouseCol: 4,
        mouseRow: 3,
      },
      {
        name: 'second line, end char',
        relX: 5,
        relY: 1,
        mouseCol: 9,
        mouseRow: 3,
      },
    ])(
      'should move cursor on mouse click - $name',
      async ({ relX, relY, mouseCol, mouseRow }) => {
        props.buffer.text = 'hello world\nsecond line';
        props.buffer.lines = ['hello world', 'second line'];
        props.buffer.viewportVisualLines = ['hello world', 'second line'];
        props.buffer.visualToLogicalMap = [
          [0, 0],
          [1, 0],
        ];
        props.buffer.visualCursor = [0, 11];
        props.buffer.visualScrollRow = 0;

        const { stdin, stdout, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
          { mouseEventsEnabled: true, uiActions },
        );

        // Wait for initial render
        await waitFor(() => {
          expect(stdout.lastFrame()).toContain('hello world');
        });

        // Simulate left mouse press at calculated coordinates.
        // Without left border: inner box is at x=3, y=1 based on padding(1)+prompt(2) and border-top(1).
        await act(async () => {
          stdin.write(`\x1b[<0;${mouseCol};${mouseRow}M`);
        });

        await waitFor(() => {
          expect(props.buffer.moveToVisualPosition).toHaveBeenCalledWith(
            relY,
            relX,
          );
        });

        unmount();
      },
    );

    it('should unfocus embedded shell on click', async () => {
      props.buffer.text = 'hello';
      props.buffer.lines = ['hello'];
      props.buffer.viewportVisualLines = ['hello'];
      props.buffer.visualToLogicalMap = [[0, 0]];
      props.isEmbeddedShellFocused = true;

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { mouseEventsEnabled: true, uiActions },
      );
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('hello');
      });

      await act(async () => {
        // Click somewhere in the prompt
        stdin.write(`\x1b[<0;5;2M`);
      });

      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(false);
      });

      unmount();
    });

    it('should toggle paste expansion on double-click', async () => {
      const id = '[Pasted Text: 10 lines]';
      const largeText =
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';

      const baseProps = props;
      const TestWrapper = () => {
        const [isExpanded, setIsExpanded] = useState(false);
        const currentLines = isExpanded ? largeText.split('\n') : [id];
        const currentText = isExpanded ? largeText : id;

        const buffer = {
          ...baseProps.buffer,
          text: currentText,
          lines: currentLines,
          viewportVisualLines: currentLines,
          allVisualLines: currentLines,
          pastedContent: { [id]: largeText },
          transformationsByLine: isExpanded
            ? currentLines.map(() => [])
            : [
                [
                  {
                    logStart: 0,
                    logEnd: id.length,
                    logicalText: id,
                    collapsedText: id,
                    type: 'paste',
                    id,
                  },
                ],
              ],
          visualScrollRow: 0,
          visualToLogicalMap: currentLines.map(
            (_, i) => [i, 0] as [number, number],
          ),
          visualToTransformedMap: currentLines.map(() => 0),
          getLogicalPositionFromVisual: vi.fn().mockReturnValue({
            row: 0,
            col: 2,
          }),
          togglePasteExpansion: vi.fn().mockImplementation(() => {
            setIsExpanded(!isExpanded);
          }),
          getExpandedPasteAtLine: vi
            .fn()
            .mockReturnValue(isExpanded ? id : null),
        };

        return <InputPrompt {...baseProps} buffer={buffer as TextBuffer} />;
      };

      const { stdout, unmount, simulateClick } = renderWithProviders(
        <TestWrapper />,
        {
          mouseEventsEnabled: true,
          useAlternateBuffer: true,
          uiActions,
        },
      );

      // 1. Verify initial placeholder
      await waitFor(() => {
        expect(stdout.lastFrame()).toMatchSnapshot();
      });

      // Simulate double-click to expand
      await simulateClick(5, 2);
      await simulateClick(5, 2);

      // 2. Verify expanded content is visible
      await waitFor(() => {
        expect(stdout.lastFrame()).toMatchSnapshot();
      });

      // Simulate double-click to collapse
      await simulateClick(5, 2);
      await simulateClick(5, 2);

      // 3. Verify placeholder is restored
      await waitFor(() => {
        expect(stdout.lastFrame()).toMatchSnapshot();
      });

      unmount();
    });

    it('should collapse expanded paste on double-click after the end of the line', async () => {
      const id = '[Pasted Text: 10 lines]';
      const largeText =
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';

      const baseProps = props;
      const TestWrapper = () => {
        const [isExpanded, setIsExpanded] = useState(true); // Start expanded
        const currentLines = isExpanded ? largeText.split('\n') : [id];
        const currentText = isExpanded ? largeText : id;

        const buffer = {
          ...baseProps.buffer,
          text: currentText,
          lines: currentLines,
          viewportVisualLines: currentLines,
          allVisualLines: currentLines,
          pastedContent: { [id]: largeText },
          transformationsByLine: isExpanded
            ? currentLines.map(() => [])
            : [
                [
                  {
                    logStart: 0,
                    logEnd: id.length,
                    logicalText: id,
                    collapsedText: id,
                    type: 'paste',
                    id,
                  },
                ],
              ],
          visualScrollRow: 0,
          visualToLogicalMap: currentLines.map(
            (_, i) => [i, 0] as [number, number],
          ),
          visualToTransformedMap: currentLines.map(() => 0),
          getLogicalPositionFromVisual: vi.fn().mockImplementation(
            (_vRow, _vCol) =>
              // Simulate that we are past the end of the line by returning something
              // that getTransformUnderCursor won't match, or having the caller handle it.
              null,
          ),
          togglePasteExpansion: vi.fn().mockImplementation(() => {
            setIsExpanded(!isExpanded);
          }),
          getExpandedPasteAtLine: vi
            .fn()
            .mockImplementation((row) =>
              isExpanded && row >= 0 && row < 10 ? id : null,
            ),
        };

        return <InputPrompt {...baseProps} buffer={buffer as TextBuffer} />;
      };

      const { stdout, unmount, simulateClick } = renderWithProviders(
        <TestWrapper />,
        {
          mouseEventsEnabled: true,
          useAlternateBuffer: true,
          uiActions,
        },
      );

      // Verify initially expanded
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('line1');
      });

      // Simulate double-click WAY to the right on the first line
      await simulateClick(90, 2);
      await simulateClick(90, 2);

      // Verify it is NOW collapsed
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain(id);
        expect(stdout.lastFrame()).not.toContain('line1');
      });

      unmount();
    });

    it('should move cursor on mouse click with plain borders', async () => {
      props.config.getUseBackgroundColor = () => false;
      props.buffer.text = 'hello world';
      props.buffer.lines = ['hello world'];
      props.buffer.viewportVisualLines = ['hello world'];
      props.buffer.visualToLogicalMap = [[0, 0]];
      props.buffer.visualCursor = [0, 11];
      props.buffer.visualScrollRow = 0;

      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { mouseEventsEnabled: true, uiActions },
      );

      // Wait for initial render
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('hello world');
      });

      // With plain borders: 1(border) + 1(padding) + 2(prompt) = 4 offset (x=4, col=5)
      await act(async () => {
        stdin.write(`\x1b[<0;5;2M`); // Click at col 5, row 2
      });

      await waitFor(() => {
        expect(props.buffer.moveToVisualPosition).toHaveBeenCalledWith(0, 0);
      });

      unmount();
    });
  });

  describe('queued message editing', () => {
    it('should load all queued messages when up arrow is pressed with empty input', async () => {
      const mockPopAllMessages = vi.fn();
      mockPopAllMessages.mockReturnValue('Message 1\n\nMessage 2\n\nMessage 3');
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());

      expect(props.buffer.setText).toHaveBeenCalledWith(
        'Message 1\n\nMessage 2\n\nMessage 3',
      );
      unmount();
    });

    it('should not load queued messages when input is not empty', async () => {
      const mockPopAllMessages = vi.fn();
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = 'some text';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() =>
        expect(mockInputHistory.navigateUp).toHaveBeenCalled(),
      );
      expect(mockPopAllMessages).not.toHaveBeenCalled();
      unmount();
    });

    it('should handle undefined messages from popAllMessages', async () => {
      const mockPopAllMessages = vi.fn();
      mockPopAllMessages.mockReturnValue(undefined);
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());

      expect(props.buffer.setText).not.toHaveBeenCalled();
      expect(mockInputHistory.navigateUp).toHaveBeenCalled();
      unmount();
    });

    it('should work with NAVIGATION_UP key as well', async () => {
      const mockPopAllMessages = vi.fn();
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';
      props.buffer.allVisualLines = [''];
      props.buffer.visualCursor = [0, 0];
      props.buffer.visualScrollRow = 0;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());
      unmount();
    });

    it('should handle single queued message', async () => {
      const mockPopAllMessages = vi.fn();
      mockPopAllMessages.mockReturnValue('Single message');
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());

      expect(props.buffer.setText).toHaveBeenCalledWith('Single message');
      unmount();
    });

    it('should only check for queued messages when buffer text is trimmed empty', async () => {
      const mockPopAllMessages = vi.fn();
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '   '; // Whitespace only

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());
      unmount();
    });

    it('should not call popAllMessages if it is not provided', async () => {
      props.popAllMessages = undefined;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() =>
        expect(mockInputHistory.navigateUp).toHaveBeenCalled(),
      );
      unmount();
    });

    it('should navigate input history on fresh start when no queued messages exist', async () => {
      const mockPopAllMessages = vi.fn();
      mockPopAllMessages.mockReturnValue(undefined);
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());

      expect(mockInputHistory.navigateUp).toHaveBeenCalled();
      expect(props.buffer.setText).not.toHaveBeenCalled();

      unmount();
    });
  });

  describe('snapshots', () => {
    it('should render correctly in shell mode', async () => {
      props.shellModeActive = true;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => expect(stdout.lastFrame()).toContain('!'));
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should render correctly when accepting edits', async () => {
      props.approvalMode = ApprovalMode.AUTO_EDIT;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => expect(stdout.lastFrame()).toContain('>'));
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should render correctly in yolo mode', async () => {
      props.approvalMode = ApprovalMode.YOLO;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => expect(stdout.lastFrame()).toContain('*'));
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });
    it('should not show inverted cursor when shell is focused', async () => {
      props.isEmbeddedShellFocused = true;
      props.focus = false;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => {
        expect(stdout.lastFrame()).not.toContain(`{chalk.inverse(' ')}`);
      });
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  it('should still allow input when shell is not focused', async () => {
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      shellFocus: false,
    });

    await act(async () => {
      stdin.write('a');
    });
    await waitFor(() => expect(mockBuffer.handleInput).toHaveBeenCalled());
    unmount();
  });
  describe('command queuing while streaming', () => {
    beforeEach(() => {
      props.streamingState = StreamingState.Responding;
      props.setQueueErrorMessage = vi.fn();
      props.onSubmit = vi.fn();
    });

    it.each([
      {
        name: 'should prevent slash commands',
        bufferText: '/help',
        shellMode: false,
        shouldSubmit: false,
        errorMessage: 'Slash commands cannot be queued',
      },
      {
        name: 'should prevent shell commands',
        bufferText: 'ls',
        shellMode: true,
        shouldSubmit: false,
        errorMessage: 'Shell commands cannot be queued',
      },
      {
        name: 'should allow regular messages',
        bufferText: 'regular message',
        shellMode: false,
        shouldSubmit: true,
        errorMessage: null,
      },
    ])(
      '$name',
      async ({ bufferText, shellMode, shouldSubmit, errorMessage }) => {
        props.buffer.text = bufferText;
        props.shellModeActive = shellMode;

        const { stdin, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
        );
        await act(async () => {
          stdin.write('\r');
        });
        await waitFor(() => {
          if (shouldSubmit) {
            expect(props.onSubmit).toHaveBeenCalledWith(bufferText);
            expect(props.setQueueErrorMessage).not.toHaveBeenCalled();
          } else {
            expect(props.onSubmit).not.toHaveBeenCalled();
            expect(props.setQueueErrorMessage).toHaveBeenCalledWith(
              errorMessage,
            );
          }
        });
        unmount();
      },
    );
  });

  describe('IME Cursor Support', () => {
    it('should report correct cursor position for simple ASCII text', async () => {
      const text = 'hello';
      mockBuffer.text = text;
      mockBuffer.lines = [text];
      mockBuffer.viewportVisualLines = [text];
      mockBuffer.visualToLogicalMap = [[0, 0]];
      mockBuffer.visualCursor = [0, 3]; // Cursor after 'hel'
      mockBuffer.visualScrollRow = 0;

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { uiActions },
      );

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('hello');
      });

      // Check Text calls from the LAST render
      const textCalls = vi.mocked(Text).mock.calls;
      const cursorLineCall = [...textCalls]
        .reverse()
        .find((call) => call[0].terminalCursorFocus === true);

      expect(cursorLineCall).toBeDefined();
      // 'hel' is 3 characters wide
      expect(cursorLineCall![0].terminalCursorPosition).toBe(3);
      unmount();
    });

    it('should report correct cursor position for text with double-width characters', async () => {
      const text = '👍hello';
      mockBuffer.text = text;
      mockBuffer.lines = [text];
      mockBuffer.viewportVisualLines = [text];
      mockBuffer.visualToLogicalMap = [[0, 0]];
      mockBuffer.visualCursor = [0, 2]; // Cursor after '👍h' (Note: '👍' is one code point but width 2)
      mockBuffer.visualScrollRow = 0;

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { uiActions },
      );

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('👍hello');
      });

      const textCalls = vi.mocked(Text).mock.calls;
      const cursorLineCall = [...textCalls]
        .reverse()
        .find((call) => call[0].terminalCursorFocus === true);

      expect(cursorLineCall).toBeDefined();
      // '👍' is width 2, 'h' is width 1. Total width = 3.
      expect(cursorLineCall![0].terminalCursorPosition).toBe(3);
      unmount();
    });

    it('should report correct cursor position for a line full of "😀" emojis', async () => {
      const text = '😀😀😀';
      mockBuffer.text = text;
      mockBuffer.lines = [text];
      mockBuffer.viewportVisualLines = [text];
      mockBuffer.visualToLogicalMap = [[0, 0]];
      mockBuffer.visualCursor = [0, 2]; // Cursor after 2 emojis (each 1 code point, width 2)
      mockBuffer.visualScrollRow = 0;

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { uiActions },
      );

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('😀😀😀');
      });

      const textCalls = vi.mocked(Text).mock.calls;
      const cursorLineCall = [...textCalls]
        .reverse()
        .find((call) => call[0].terminalCursorFocus === true);

      expect(cursorLineCall).toBeDefined();
      // 2 emojis * width 2 = 4
      expect(cursorLineCall![0].terminalCursorPosition).toBe(4);
      unmount();
    });

    it('should report correct cursor position for mixed emojis and multi-line input', async () => {
      const lines = ['😀😀', 'hello 😀', 'world'];
      mockBuffer.text = lines.join('\n');
      mockBuffer.lines = lines;
      mockBuffer.viewportVisualLines = lines;
      mockBuffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
        [2, 0],
      ];
      mockBuffer.visualCursor = [1, 7]; // Second line, after 'hello 😀' (6 chars + 1 emoji = 7 code points)
      mockBuffer.visualScrollRow = 0;

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { uiActions },
      );

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('hello 😀');
      });

      const textCalls = vi.mocked(Text).mock.calls;
      const lineCalls = textCalls.filter(
        (call) => call[0].terminalCursorPosition !== undefined,
      );
      const lastRenderLineCalls = lineCalls.slice(-3);

      const focusCall = lastRenderLineCalls.find(
        (call) => call[0].terminalCursorFocus === true,
      );
      expect(focusCall).toBeDefined();
      // 'hello ' is 6 units, '😀' is 2 units. Total = 8.
      expect(focusCall![0].terminalCursorPosition).toBe(8);
      unmount();
    });

    it('should report correct cursor position and focus for multi-line input', async () => {
      const lines = ['first line', 'second line', 'third line'];
      mockBuffer.text = lines.join('\n');
      mockBuffer.lines = lines;
      mockBuffer.viewportVisualLines = lines;
      mockBuffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
        [2, 0],
      ];
      mockBuffer.visualCursor = [1, 7]; // Cursor on second line, after 'second '
      mockBuffer.visualScrollRow = 0;

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { uiActions },
      );

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('second line');
      });

      const textCalls = vi.mocked(Text).mock.calls;

      // We look for the last set of line calls.
      // Line calls have terminalCursorPosition set.
      const lineCalls = textCalls.filter(
        (call) => call[0].terminalCursorPosition !== undefined,
      );
      const lastRenderLineCalls = lineCalls.slice(-3);

      expect(lastRenderLineCalls.length).toBe(3);

      // Only one line should have terminalCursorFocus=true
      const focusCalls = lastRenderLineCalls.filter(
        (call) => call[0].terminalCursorFocus === true,
      );
      expect(focusCalls.length).toBe(1);
      expect(focusCalls[0][0].terminalCursorPosition).toBe(7);
      unmount();
    });

    it('should report cursor position 0 when input is empty and placeholder is shown', async () => {
      mockBuffer.text = '';
      mockBuffer.lines = [''];
      mockBuffer.viewportVisualLines = [''];
      mockBuffer.visualToLogicalMap = [[0, 0]];
      mockBuffer.visualCursor = [0, 0];
      mockBuffer.visualScrollRow = 0;

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} placeholder="Type here" />,
        { uiActions },
      );

      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('Type here');
      });

      const textCalls = vi.mocked(Text).mock.calls;
      const cursorLineCall = [...textCalls]
        .reverse()
        .find((call) => call[0].terminalCursorFocus === true);

      expect(cursorLineCall).toBeDefined();
      expect(cursorLineCall![0].terminalCursorPosition).toBe(0);
      unmount();
    });
  });

  describe('image path transformation snapshots', () => {
    const logicalLine = '@/path/to/screenshots/screenshot2x.png';
    const transformations = calculateTransformationsForLine(logicalLine);

    const applyVisualState = (visualLine: string, cursorCol: number): void => {
      mockBuffer.text = logicalLine;
      mockBuffer.lines = [logicalLine];
      mockBuffer.viewportVisualLines = [visualLine];
      mockBuffer.allVisualLines = [visualLine];
      mockBuffer.visualToLogicalMap = [[0, 0]];
      mockBuffer.visualToTransformedMap = [0];
      mockBuffer.transformationsByLine = [transformations];
      mockBuffer.cursor = [0, cursorCol];
      mockBuffer.visualCursor = [0, 0];
    };

    it('should snapshot collapsed image path', async () => {
      const { transformedLine } = calculateTransformedLine(
        logicalLine,
        0,
        [0, transformations[0].logEnd + 5],
        transformations,
      );
      applyVisualState(transformedLine, transformations[0].logEnd + 5);

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('[Image');
      });
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should snapshot expanded image path when cursor is on it', async () => {
      const { transformedLine } = calculateTransformedLine(
        logicalLine,
        0,
        [0, transformations[0].logStart + 1],
        transformations,
      );
      applyVisualState(transformedLine, transformations[0].logStart + 1);

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('@/path/to/screenshots');
      });
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  describe('Ctrl+O paste expansion', () => {
    const CTRL_O = '\x0f'; // Ctrl+O key sequence

    it('Ctrl+O triggers paste expansion via keybinding', async () => {
      const id = '[Pasted Text: 10 lines]';
      const toggleFn = vi.fn();
      const buffer = {
        ...props.buffer,
        text: id,
        cursor: [0, 0] as number[],
        pastedContent: {
          [id]: 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10',
        },
        transformationsByLine: [
          [
            {
              logStart: 0,
              logEnd: id.length,
              logicalText: id,
              collapsedText: id,
              type: 'paste',
              id,
            },
          ],
        ],
        expandedPaste: null,
        getExpandedPasteAtLine: vi.fn().mockReturnValue(null),
        togglePasteExpansion: toggleFn,
      } as unknown as TextBuffer;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} buffer={buffer} />,
        { uiActions },
      );

      await act(async () => {
        stdin.write(CTRL_O);
      });

      await waitFor(() => {
        expect(toggleFn).toHaveBeenCalledWith(id, 0, 0);
      });
      unmount();
    });

    it.each([
      {
        name: 'hint appears on large paste via Ctrl+V',
        text: 'line1\nline2\nline3\nline4\nline5\nline6',
        method: 'ctrl-v',
        expectHint: true,
      },
      {
        name: 'hint does not appear for small pastes via Ctrl+V',
        text: 'hello',
        method: 'ctrl-v',
        expectHint: false,
      },
      {
        name: 'hint appears on large terminal paste event',
        text: 'line1\nline2\nline3\nline4\nline5\nline6',
        method: 'terminal-paste',
        expectHint: true,
      },
    ])('$name', async ({ text, method, expectHint }) => {
      vi.mocked(clipboardy.read).mockResolvedValue(text);
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);

      const emitSpy = vi.spyOn(appEvents, 'emit');
      const buffer = {
        ...props.buffer,
        handleInput: vi.fn().mockReturnValue(true),
      } as unknown as TextBuffer;

      // Need kitty protocol enabled for terminal paste events
      if (method === 'terminal-paste') {
        mockedUseKittyKeyboardProtocol.mockReturnValue({
          enabled: true,
          checking: false,
        });
      }

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt
          {...props}
          buffer={method === 'terminal-paste' ? buffer : props.buffer}
        />,
      );

      await act(async () => {
        if (method === 'ctrl-v') {
          stdin.write('\x16'); // Ctrl+V
        } else {
          stdin.write(`\x1b[200~${text}\x1b[201~`);
        }
      });

      await waitFor(() => {
        if (expectHint) {
          expect(emitSpy).toHaveBeenCalledWith(AppEvent.TransientMessage, {
            message: 'Press Ctrl+O to expand pasted text',
            type: TransientMessageType.Hint,
          });
        } else {
          // If no hint expected, verify buffer was still updated
          if (method === 'ctrl-v') {
            expect(mockBuffer.insert).toHaveBeenCalledWith(text, {
              paste: true,
            });
          } else {
            expect(buffer.handleInput).toHaveBeenCalled();
          }
        }
      });

      if (!expectHint) {
        expect(emitSpy).not.toHaveBeenCalledWith(
          AppEvent.TransientMessage,
          expect.any(Object),
        );
      }

      emitSpy.mockRestore();
      unmount();
    });
  });

  describe('tryTogglePasteExpansion', () => {
    it.each([
      {
        name: 'returns false when no pasted content exists',
        cursor: [0, 0],
        pastedContent: {},
        getExpandedPasteAtLine: null,
        expected: false,
      },
      {
        name: 'expands placeholder under cursor',
        cursor: [0, 2],
        pastedContent: { '[Pasted Text: 6 lines]': 'content' },
        transformations: [
          {
            logStart: 0,
            logEnd: '[Pasted Text: 6 lines]'.length,
            id: '[Pasted Text: 6 lines]',
          },
        ],
        expected: true,
        expectedToggle: ['[Pasted Text: 6 lines]', 0, 2],
      },
      {
        name: 'collapses expanded paste when cursor is inside',
        cursor: [1, 0],
        pastedContent: { '[Pasted Text: 6 lines]': 'a\nb\nc' },
        getExpandedPasteAtLine: '[Pasted Text: 6 lines]',
        expected: true,
        expectedToggle: ['[Pasted Text: 6 lines]', 1, 0],
      },
      {
        name: 'expands placeholder when cursor is immediately after it',
        cursor: [0, '[Pasted Text: 6 lines]'.length],
        pastedContent: { '[Pasted Text: 6 lines]': 'content' },
        transformations: [
          {
            logStart: 0,
            logEnd: '[Pasted Text: 6 lines]'.length,
            id: '[Pasted Text: 6 lines]',
          },
        ],
        expected: true,
        expectedToggle: [
          '[Pasted Text: 6 lines]',
          0,
          '[Pasted Text: 6 lines]'.length,
        ],
      },
      {
        name: 'shows hint when cursor is not on placeholder but placeholders exist',
        cursor: [0, 0],
        pastedContent: { '[Pasted Text: 6 lines]': 'content' },
        transformationsByLine: [
          [],
          [
            {
              logStart: 0,
              logEnd: '[Pasted Text: 6 lines]'.length,
              type: 'paste',
              id: '[Pasted Text: 6 lines]',
            },
          ],
        ],
        expected: true,
        expectedHint: 'Move cursor within placeholder to expand',
      },
    ])(
      '$name',
      ({
        cursor,
        pastedContent,
        transformations,
        transformationsByLine,
        getExpandedPasteAtLine,
        expected,
        expectedToggle,
        expectedHint,
      }) => {
        const id = '[Pasted Text: 6 lines]';
        const buffer = {
          cursor,
          pastedContent,
          transformationsByLine: transformationsByLine || [
            transformations
              ? transformations.map((t) => ({
                  ...t,
                  logicalText: id,
                  collapsedText: id,
                  type: 'paste',
                }))
              : [],
          ],
          getExpandedPasteAtLine: vi
            .fn()
            .mockReturnValue(getExpandedPasteAtLine),
          togglePasteExpansion: vi.fn(),
        } as unknown as TextBuffer;

        const emitSpy = vi.spyOn(appEvents, 'emit');
        expect(tryTogglePasteExpansion(buffer)).toBe(expected);

        if (expectedToggle) {
          expect(buffer.togglePasteExpansion).toHaveBeenCalledWith(
            ...expectedToggle,
          );
        } else {
          expect(buffer.togglePasteExpansion).not.toHaveBeenCalled();
        }

        if (expectedHint) {
          expect(emitSpy).toHaveBeenCalledWith(AppEvent.TransientMessage, {
            message: expectedHint,
            type: TransientMessageType.Hint,
          });
        } else {
          expect(emitSpy).not.toHaveBeenCalledWith(
            AppEvent.TransientMessage,
            expect.any(Object),
          );
        }
        emitSpy.mockRestore();
      },
    );
  });

  describe('History Navigation and Completion Suppression', () => {
    beforeEach(() => {
      props.userMessages = ['first message', 'second message'];
      // Mock useInputHistory to actually call onChange
      mockedUseInputHistory.mockImplementation(({ onChange, onSubmit }) => ({
        navigateUp: () => {
          onChange('second message', 'start');
          return true;
        },
        navigateDown: () => {
          onChange('first message', 'end');
          return true;
        },
        handleSubmit: vi.fn((val) => onSubmit(val)),
      }));
    });

    it.each([
      { name: 'Up arrow', key: '\u001B[A', position: 'start' },
      { name: 'Ctrl+P', key: '\u0010', position: 'start' },
    ])(
      'should move cursor to $position on $name (older history)',
      async ({ key, position }) => {
        const { stdin } = renderWithProviders(<InputPrompt {...props} />, {
          uiActions,
        });

        await act(async () => {
          stdin.write(key);
        });

        await waitFor(() => {
          expect(mockBuffer.setText).toHaveBeenCalledWith(
            'second message',
            position as 'start' | 'end',
          );
        });
      },
    );

    it.each([
      { name: 'Down arrow', key: '\u001B[B', position: 'end' },
      { name: 'Ctrl+N', key: '\u000E', position: 'end' },
    ])(
      'should move cursor to $position on $name (newer history)',
      async ({ key, position }) => {
        const { stdin } = renderWithProviders(<InputPrompt {...props} />, {
          uiActions,
        });

        // First go up
        await act(async () => {
          stdin.write('\u001B[A');
        });

        // Then go down
        await act(async () => {
          stdin.write(key);
          if (key === '\u001B[B') {
            // Second press to actually navigate history
            stdin.write(key);
          }
        });

        await waitFor(() => {
          expect(mockBuffer.setText).toHaveBeenCalledWith(
            'first message',
            position as 'start' | 'end',
          );
        });
      },
    );

    it('should suppress completion after history navigation', async () => {
      const { stdin } = renderWithProviders(<InputPrompt {...props} />, {
        uiActions,
      });

      await act(async () => {
        stdin.write('\u001B[A'); // Up arrow
      });

      await waitFor(() => {
        expect(mockedUseCommandCompletion).toHaveBeenLastCalledWith({
          buffer: mockBuffer,
          cwd: expect.anything(),
          slashCommands: expect.anything(),
          commandContext: expect.anything(),
          reverseSearchActive: expect.anything(),
          shellModeActive: expect.anything(),
          config: expect.anything(),
          active: false,
        });
      });
    });

    it('should not render suggestions during history navigation', async () => {
      // 1. Set up a dynamic mock implementation BEFORE rendering
      mockedUseCommandCompletion.mockImplementation(({ active }) => ({
        ...mockCommandCompletion,
        showSuggestions: active,
        suggestions: active
          ? [{ value: 'suggestion', label: 'suggestion' }]
          : [],
      }));

      const { stdout, stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { uiActions },
      );

      // 2. Verify suggestions ARE showing initially because active is true by default
      await waitFor(() => {
        expect(stdout.lastFrame()).toContain('suggestion');
      });

      // 3. Trigger history navigation which should set suppressCompletion to true
      await act(async () => {
        stdin.write('\u001B[A');
      });

      // 4. Verify that suggestions are NOT in the output frame after navigation
      await waitFor(() => {
        expect(stdout.lastFrame()).not.toContain('suggestion');
      });

      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should continue to suppress completion after manual cursor movement', async () => {
      const { stdin } = renderWithProviders(<InputPrompt {...props} />, {
        uiActions,
      });

      // Navigate history (suppresses)
      await act(async () => {
        stdin.write('\u001B[A');
      });

      // Wait for it to be suppressed
      await waitFor(() => {
        expect(mockedUseCommandCompletion).toHaveBeenLastCalledWith({
          buffer: mockBuffer,
          cwd: expect.anything(),
          slashCommands: expect.anything(),
          commandContext: expect.anything(),
          reverseSearchActive: expect.anything(),
          shellModeActive: expect.anything(),
          config: expect.anything(),
          active: false,
        });
      });

      // Move cursor manually
      await act(async () => {
        stdin.write('\u001B[D'); // Left arrow
      });

      await waitFor(() => {
        expect(mockedUseCommandCompletion).toHaveBeenLastCalledWith({
          buffer: mockBuffer,
          cwd: expect.anything(),
          slashCommands: expect.anything(),
          commandContext: expect.anything(),
          reverseSearchActive: expect.anything(),
          shellModeActive: expect.anything(),
          config: expect.anything(),
          active: false,
        });
      });
    });

    it('should re-enable completion after typing', async () => {
      const { stdin } = renderWithProviders(<InputPrompt {...props} />, {
        uiActions,
      });

      // Navigate history (suppresses)
      await act(async () => {
        stdin.write('\u001B[A');
      });

      // Wait for it to be suppressed
      await waitFor(() => {
        expect(mockedUseCommandCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({ active: false }),
        );
      });

      // Type a character
      await act(async () => {
        stdin.write('a');
      });

      await waitFor(() => {
        expect(mockedUseCommandCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({ active: true }),
        );
      });
    });
  });

  describe('shortcuts help visibility', () => {
    it('opens shortcuts help with ? on empty prompt even when showShortcutsHint is false', async () => {
      const setShortcutsHelpVisible = vi.fn();
      const settings = createMockSettings({
        ui: { showShortcutsHint: false },
      });

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        {
          settings,
          uiActions: { setShortcutsHelpVisible },
        },
      );

      await act(async () => {
        stdin.write('?');
      });

      await waitFor(() => {
        expect(setShortcutsHelpVisible).toHaveBeenCalledWith(true);
      });
      unmount();
    });

    it.each([
      {
        name: 'terminal paste event occurs',
        input: '\x1b[200~pasted text\x1b[201~',
      },
      {
        name: 'Ctrl+V (PASTE_CLIPBOARD) is pressed',
        input: '\x16',
        setupMocks: () => {
          vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
          vi.mocked(clipboardy.read).mockResolvedValue('clipboard text');
        },
      },
      {
        name: 'mouse right-click paste occurs',
        input: '\x1b[<2;1;1m',
        mouseEventsEnabled: true,
        setupMocks: () => {
          vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
          vi.mocked(clipboardy.read).mockResolvedValue('clipboard text');
        },
      },
      {
        name: 'Ctrl+R hotkey is pressed',
        input: '\x12',
      },
      {
        name: 'Ctrl+X hotkey is pressed',
        input: '\x18',
      },
      {
        name: 'F12 hotkey is pressed',
        input: '\x1b[24~',
      },
    ])(
      'should close shortcuts help when a $name',
      async ({ input, setupMocks, mouseEventsEnabled }) => {
        setupMocks?.();
        const setShortcutsHelpVisible = vi.fn();
        const { stdin, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
          {
            uiState: { shortcutsHelpVisible: true },
            uiActions: { setShortcutsHelpVisible },
            mouseEventsEnabled,
          },
        );

        await act(async () => {
          stdin.write(input);
        });

        await waitFor(() => {
          expect(setShortcutsHelpVisible).toHaveBeenCalledWith(false);
        });
        unmount();
      },
    );
  });
});

function clean(str: string | undefined): string {
  if (!str) return '';
  // Remove ANSI escape codes and trim whitespace
  return stripAnsi(str).trim();
}
