/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { act } from 'react';
import type { InputPromptProps } from './InputPrompt.js';
import { InputPrompt } from './InputPrompt.js';
import type { TextBuffer } from './shared/text-buffer.js';
import type { Config } from '@google/gemini-cli-core';
import { ApprovalMode } from '@google/gemini-cli-core';
import * as path from 'node:path';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { UseShellHistoryReturn } from '../hooks/useShellHistory.js';
import { useShellHistory } from '../hooks/useShellHistory.js';
import type { UseCommandCompletionReturn } from '../hooks/useCommandCompletion.js';
import { useCommandCompletion } from '../hooks/useCommandCompletion.js';
import type { UseInputHistoryReturn } from '../hooks/useInputHistory.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import type { UseReverseSearchCompletionReturn } from '../hooks/useReverseSearchCompletion.js';
import { useReverseSearchCompletion } from '../hooks/useReverseSearchCompletion.js';
import * as clipboardUtils from '../utils/clipboardUtils.js';
import { useKittyKeyboardProtocol } from '../hooks/useKittyKeyboardProtocol.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import { StreamingState } from '../types.js';

vi.mock('../hooks/useShellHistory.js');
vi.mock('../hooks/useCommandCompletion.js');
vi.mock('../hooks/useInputHistory.js');
vi.mock('../hooks/useReverseSearchCompletion.js');
vi.mock('../utils/clipboardUtils.js');
vi.mock('../hooks/useKittyKeyboardProtocol.js');

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

  beforeEach(() => {
    vi.resetAllMocks();

    mockCommandContext = createMockCommandContext();

    mockBuffer = {
      text: '',
      cursor: [0, 0],
      lines: [''],
      setText: vi.fn((newText: string) => {
        mockBuffer.text = newText;
        mockBuffer.lines = [newText];
        mockBuffer.cursor = [0, newText.length];
        mockBuffer.viewportVisualLines = [newText];
        mockBuffer.allVisualLines = [newText];
        mockBuffer.visualToLogicalMap = [[0, 0]];
      }),
      replaceRangeByOffset: vi.fn(),
      viewportVisualLines: [''],
      allVisualLines: [''],
      visualCursor: [0, 0],
      visualScrollRow: 0,
      handleInput: vi.fn(),
      move: vi.fn(),
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
      setShowSuggestions: vi.fn(),
      handleAutocomplete: vi.fn(),
      promptCompletion: {
        text: '',
        accept: vi.fn(),
        clear: vi.fn(),
        isLoading: false,
        isActive: false,
        markSelected: vi.fn(),
      },
    };
    mockedUseCommandCompletion.mockReturnValue(mockCommandCompletion);

    mockInputHistory = {
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      handleSubmit: vi.fn(),
    };
    mockedUseInputHistory.mockReturnValue(mockInputHistory);

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
      supported: false,
      enabled: false,
      checking: false,
    });

    props = {
      buffer: mockBuffer,
      onSubmit: vi.fn(),
      userMessages: [],
      onClearScreen: vi.fn(),
      config: {
        getProjectRoot: () => path.join('test', 'project'),
        getTargetDir: () => path.join('test', 'project', 'src'),
        getVimMode: () => false,
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
    };
  });

  it('should call shellHistory.getPreviousCommand on up arrow in shell mode', async () => {
    props.shellModeActive = true;
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

    await act(async () => {
      stdin.write('\u001B[A'); // Up arrow
    });
    await waitFor(() => expect(mockInputHistory.navigateUp).toHaveBeenCalled());

    await act(async () => {
      stdin.write('\u001B[B'); // Down arrow
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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

    await act(async () => {
      stdin.write('\u001B[A'); // Up arrow
    });
    await waitFor(() => expect(mockInputHistory.navigateUp).toHaveBeenCalled());
    await act(async () => {
      stdin.write('\u001B[B'); // Down arrow
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
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
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
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error handling clipboard image:',
          expect.any(Error),
        );
      });
      expect(mockBuffer.setText).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
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
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('/clear'));
    unmount();
  });

  it('should submit directly on Enter when a complete leaf command is typed', async () => {
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: false,
      isPerfectMatch: false, // Added explicit isPerfectMatch false
    });
    props.buffer.setText('/clear');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('/clear'));
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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

  it('should NOT clear the buffer on Ctrl+C if it is empty', async () => {
    props.buffer.text = '';
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

    await act(async () => {
      stdin.write('\x03'); // Ctrl+C character
    });

    await waitFor(() => {
      expect(props.buffer.setText).not.toHaveBeenCalled();
    });
    unmount();
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

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);

      await waitFor(() => {
        expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
          mockBuffer,
          ['/test/project/src'],
          path.join('test', 'project', 'src'),
          mockSlashCommands,
          mockCommandContext,
          false,
          false,
          expect.any(Object),
        );
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
            paste: true,
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
          name: 'at the end of a line with unicode characters',
          text: 'hello 👍',
          visualCursor: [0, 8],
          expected: `hello 👍${chalk.inverse(' ')}`,
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

        const { stdout, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
        );

        await waitFor(() => {
          const frame = stdout.lastFrame();
          const lines = frame!.split('\n');
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
        [0, 0], // 'hello' starts at col 0 of logical line 0
        [1, 0], // '' (blank) is logical line 1, col 0
        [2, 0], // 'world' is logical line 2, col 0
      ];

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await waitFor(() => {
        const frame = stdout.lastFrame();
        // Check that all lines, including the empty one, are rendered.
        // This implicitly tests that the Box wrapper provides height for the empty line.
        expect(frame).toContain('hello');
        expect(frame).toContain(`world${chalk.inverse(' ')}`);

        const outputLines = frame!.split('\n');
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
            paste: true,
            sequence: pastedText,
          }),
        );
      });

      unmount();
    });
  });

  describe('paste auto-submission protection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockedUseKittyKeyboardProtocol.mockReturnValue({
        supported: false,
        enabled: false,
        checking: false,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
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
            supported: true,
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
          { kittyProtocolEnabled: true },
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

  describe('enhanced input UX - double ESC clear functionality', () => {
    it('should clear buffer on second ESC press', async () => {
      const onEscapePromptChange = vi.fn();
      props.onEscapePromptChange = onEscapePromptChange;
      props.buffer.setText('text to clear');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { kittyProtocolEnabled: false },
      );

      await act(async () => {
        stdin.write('\x1B');
        await waitFor(() => {
          expect(onEscapePromptChange).toHaveBeenCalledWith(false);
        });
      });

      await act(async () => {
        stdin.write('\x1B');
        await waitFor(() => {
          expect(props.buffer.setText).toHaveBeenCalledWith('');
          expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
        });
      });
      unmount();
    });

    it('should reset escape state on any non-ESC key', async () => {
      const onEscapePromptChange = vi.fn();
      props.onEscapePromptChange = onEscapePromptChange;
      props.buffer.setText('some text');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { kittyProtocolEnabled: false },
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
        { kittyProtocolEnabled: false },
      );

      await act(async () => {
        stdin.write('\x1B');
        await waitFor(() =>
          expect(props.setShellModeActive).toHaveBeenCalledWith(false),
        );
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
        { kittyProtocolEnabled: false },
      );

      await act(async () => {
        stdin.write('\x1B');
      });
      await waitFor(() =>
        expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled(),
      );
      unmount();
    });

    it('should not call onEscapePromptChange when not provided', async () => {
      vi.useFakeTimers();
      props.onEscapePromptChange = undefined;
      props.buffer.setText('some text');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { kittyProtocolEnabled: false },
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

      vi.useRealTimers();
      unmount();
    });

    it('should not interfere with existing keyboard shortcuts', async () => {
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
        { kittyProtocolEnabled: false },
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
      { name: 'standard', kittyProtocolEnabled: false, escapeSequence: '\x1B' },
      {
        name: 'kitty',
        kittyProtocolEnabled: true,
        escapeSequence: '\u001b[27u',
      },
    ])(
      'resets reverse search state on Escape ($name)',
      async ({ kittyProtocolEnabled, escapeSequence }) => {
        const { stdin, stdout, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
          { kittyProtocolEnabled },
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
        expect(stdout.lastFrame()).toMatchSnapshot(
          'command-search-render-collapsed-match',
        );
      });

      await act(async () => {
        stdin.write('\u001B[C');
      });
      await waitFor(() => {
        expect(stdout.lastFrame()).toMatchSnapshot(
          'command-search-render-expanded-match',
        );
      });

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
  });

  describe('mouse interaction', () => {
    it.each([
      {
        name: 'first line, first char',
        relX: 0,
        relY: 0,
        mouseCol: 5,
        mouseRow: 2,
      },
      {
        name: 'first line, middle char',
        relX: 6,
        relY: 0,
        mouseCol: 11,
        mouseRow: 2,
      },
      {
        name: 'second line, first char',
        relX: 0,
        relY: 1,
        mouseCol: 5,
        mouseRow: 3,
      },
      {
        name: 'second line, end char',
        relX: 5,
        relY: 1,
        mouseCol: 10,
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
          { mouseEventsEnabled: true },
        );

        // Wait for initial render
        await waitFor(() => {
          expect(stdout.lastFrame()).toContain('hello world');
        });

        // Simulate left mouse press at calculated coordinates.
        // Assumes inner box is at x=4, y=1 based on border(1)+padding(1)+prompt(2) and border-top(1).
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
  });

  describe('queued message editing', () => {
    it('should load all queued messages when up arrow is pressed with empty input', async () => {
      const mockPopAllMessages = vi.fn();
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());
      const callback = mockPopAllMessages.mock.calls[0][0];

      await act(async () => {
        callback('Message 1\n\nMessage 2\n\nMessage 3');
      });
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
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());
      const callback = mockPopAllMessages.mock.calls[0][0];
      await act(async () => {
        callback(undefined);
      });

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
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());

      const callback = mockPopAllMessages.mock.calls[0][0];
      await act(async () => {
        callback('Single message');
      });

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
      props.popAllMessages = mockPopAllMessages;
      props.buffer.text = '';

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      await act(async () => {
        stdin.write('\u001B[A');
      });
      await waitFor(() => expect(mockPopAllMessages).toHaveBeenCalled());

      const callback = mockPopAllMessages.mock.calls[0][0];
      await act(async () => {
        callback(undefined);
      });

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
      await waitFor(() => expect(stdout.lastFrame()).toMatchSnapshot());
      unmount();
    });

    it('should render correctly when accepting edits', async () => {
      props.approvalMode = ApprovalMode.AUTO_EDIT;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => expect(stdout.lastFrame()).toMatchSnapshot());
      unmount();
    });

    it('should render correctly in yolo mode', async () => {
      props.approvalMode = ApprovalMode.YOLO;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await waitFor(() => expect(stdout.lastFrame()).toMatchSnapshot());
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
        expect(stdout.lastFrame()).toMatchSnapshot();
      });
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
});

function clean(str: string | undefined): string {
  if (!str) return '';
  // Remove ANSI escape codes and trim whitespace
  return stripAnsi(str).trim();
}
