/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor, act } from '@testing-library/react';
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
    };
  });

  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  it('should call shellHistory.getPreviousCommand on up arrow in shell mode', async () => {
    props.shellModeActive = true;
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\u001B[A');
    await wait();

    expect(mockShellHistory.getPreviousCommand).toHaveBeenCalled();
    unmount();
  });

  it('should call shellHistory.getNextCommand on down arrow in shell mode', async () => {
    props.shellModeActive = true;
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\u001B[B');
    await wait();

    expect(mockShellHistory.getNextCommand).toHaveBeenCalled();
    unmount();
  });

  it('should set the buffer text when a shell history command is retrieved', async () => {
    props.shellModeActive = true;
    vi.mocked(mockShellHistory.getPreviousCommand).mockReturnValue(
      'previous command',
    );
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\u001B[A');
    await wait();

    expect(mockShellHistory.getPreviousCommand).toHaveBeenCalled();
    expect(props.buffer.setText).toHaveBeenCalledWith('previous command');
    unmount();
  });

  it('should call shellHistory.addCommandToHistory on submit in shell mode', async () => {
    props.shellModeActive = true;
    props.buffer.setText('ls -l');
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
    await wait();

    expect(mockShellHistory.addCommandToHistory).toHaveBeenCalledWith('ls -l');
    expect(props.onSubmit).toHaveBeenCalledWith('ls -l');
    unmount();
  });

  it('should NOT call shell history methods when not in shell mode', async () => {
    props.buffer.setText('some text');
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\u001B[A'); // Up arrow
    await wait();
    stdin.write('\u001B[B'); // Down arrow
    await wait();
    stdin.write('\r'); // Enter
    await wait();

    expect(mockShellHistory.getPreviousCommand).not.toHaveBeenCalled();
    expect(mockShellHistory.getNextCommand).not.toHaveBeenCalled();
    expect(mockShellHistory.addCommandToHistory).not.toHaveBeenCalled();

    expect(mockInputHistory.navigateUp).toHaveBeenCalled();
    expect(mockInputHistory.navigateDown).toHaveBeenCalled();
    expect(props.onSubmit).toHaveBeenCalledWith('some text');
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
    await wait();

    // Test up arrow
    stdin.write('\u001B[A'); // Up arrow
    await wait();

    stdin.write('\u0010'); // Ctrl+P
    await wait();
    expect(mockCommandCompletion.navigateUp).toHaveBeenCalledTimes(2);
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
    await wait();

    // Test down arrow
    stdin.write('\u001B[B'); // Down arrow
    await wait();

    stdin.write('\u000E'); // Ctrl+N
    await wait();
    expect(mockCommandCompletion.navigateDown).toHaveBeenCalledTimes(2);
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
    await wait();

    stdin.write('\u001B[A'); // Up arrow
    await wait();
    stdin.write('\u001B[B'); // Down arrow
    await wait();
    stdin.write('\u0010'); // Ctrl+P
    await wait();
    stdin.write('\u000E'); // Ctrl+N
    await wait();

    expect(mockCommandCompletion.navigateUp).not.toHaveBeenCalled();
    expect(mockCommandCompletion.navigateDown).not.toHaveBeenCalled();
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
      await wait();

      // Send Ctrl+V
      stdin.write('\x16'); // Ctrl+V
      await wait();

      expect(clipboardUtils.clipboardHasImage).toHaveBeenCalled();
      expect(clipboardUtils.saveClipboardImage).toHaveBeenCalledWith(
        props.config.getTargetDir(),
      );
      expect(clipboardUtils.cleanupOldClipboardImages).toHaveBeenCalledWith(
        props.config.getTargetDir(),
      );
      expect(mockBuffer.replaceRangeByOffset).toHaveBeenCalled();
      unmount();
    });

    it('should not insert anything when clipboard has no image', async () => {
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('\x16'); // Ctrl+V
      await wait();

      expect(clipboardUtils.clipboardHasImage).toHaveBeenCalled();
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
      await wait();

      stdin.write('\x16'); // Ctrl+V
      await wait();

      expect(clipboardUtils.saveClipboardImage).toHaveBeenCalled();
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
      await wait();

      stdin.write('\x16'); // Ctrl+V
      await wait();

      // Should insert at cursor position with spaces
      expect(mockBuffer.replaceRangeByOffset).toHaveBeenCalled();

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
      await wait();

      stdin.write('\x16'); // Ctrl+V
      await wait();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error handling clipboard image:',
        expect.any(Error),
      );
      expect(mockBuffer.setText).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
      unmount();
    });
  });

  it('should complete a partial parent command', async () => {
    // SCENARIO: /mem -> Tab
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'memory', value: 'memory', description: '...' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/mem');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    unmount();
  });

  it('should append a sub-command when the parent command is already complete', async () => {
    // SCENARIO: /memory -> Tab (to accept 'add')
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeSuggestionIndex: 1, // 'add' is highlighted
    });
    props.buffer.setText('/memory ');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(1);
    unmount();
  });

  it('should handle the "backspace" edge case correctly', async () => {
    // SCENARIO: /memory -> Backspace -> /memory -> Tab (to accept 'show')
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeSuggestionIndex: 0, // 'show' is highlighted
    });
    // The user has backspaced, so the query is now just '/memory'
    props.buffer.setText('/memory');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    // It should NOT become '/show'. It should correctly become '/memory show'.
    expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    unmount();
  });

  it('should complete a partial argument for a command', async () => {
    // SCENARIO: /chat resume fi- -> Tab
    mockedUseCommandCompletion.mockReturnValue({
      ...mockCommandCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'fix-foo', value: 'fix-foo' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/chat resume fi-');

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
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
    await wait();

    stdin.write('\r');
    await wait();

    // The app should autocomplete the text, NOT submit.
    expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);

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
    await wait();

    stdin.write('\t'); // Press Tab for autocomplete
    await wait();

    expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    unmount();
  });

  it('should not submit on Enter when the buffer is empty or only contains whitespace', async () => {
    props.buffer.setText('   '); // Set buffer to whitespace

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r'); // Press Enter
    await wait();

    expect(props.onSubmit).not.toHaveBeenCalled();
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
    await wait();

    stdin.write('\r');
    await wait();

    expect(props.onSubmit).toHaveBeenCalledWith('/clear');
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
    await wait();

    stdin.write('\r');
    await wait();

    expect(props.onSubmit).toHaveBeenCalledWith('/clear');
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
    await wait();

    stdin.write('\r');
    await wait();

    expect(mockCommandCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should add a newline on enter when the line ends with a backslash', async () => {
    // This test simulates multi-line input, not submission
    mockBuffer.text = 'first line\\';
    mockBuffer.cursor = [0, 11];
    mockBuffer.lines = ['first line\\'];

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
    await wait();

    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(props.buffer.backspace).toHaveBeenCalled();
    expect(props.buffer.newline).toHaveBeenCalled();
    unmount();
  });

  it('should clear the buffer on Ctrl+C if it has text', async () => {
    props.buffer.setText('some text to clear');
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\x03'); // Ctrl+C character
    await wait();

    expect(props.buffer.setText).toHaveBeenCalledWith('');
    expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should NOT clear the buffer on Ctrl+C if it is empty', async () => {
    props.buffer.text = '';
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);
    await wait();

    stdin.write('\x03'); // Ctrl+C character
    await wait();

    expect(props.buffer.setText).not.toHaveBeenCalled();
    unmount();
  });

  describe('cursor-based completion trigger', () => {
    it('should trigger completion when cursor is after @ without spaces', async () => {
      // Set up buffer state
      mockBuffer.text = '@src/components';
      mockBuffer.lines = ['@src/components'];
      mockBuffer.cursor = [0, 15];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'Button.tsx', value: 'Button.tsx' }],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      // Verify useCompletion was called with correct signature
      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should trigger completion when cursor is after / without spaces', async () => {
      mockBuffer.text = '/memory';
      mockBuffer.lines = ['/memory'];
      mockBuffer.cursor = [0, 7];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'show', value: 'show' }],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion when cursor is after space following @', async () => {
      mockBuffer.text = '@src/file.ts hello';
      mockBuffer.lines = ['@src/file.ts hello'];
      mockBuffer.cursor = [0, 18];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion when cursor is after space following /', async () => {
      mockBuffer.text = '/memory add';
      mockBuffer.lines = ['/memory add'];
      mockBuffer.cursor = [0, 11];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion when cursor is not after @ or /', async () => {
      mockBuffer.text = 'hello world';
      mockBuffer.lines = ['hello world'];
      mockBuffer.cursor = [0, 5];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle multiline text correctly', async () => {
      mockBuffer.text = 'first line\n/memory';
      mockBuffer.lines = ['first line', '/memory'];
      mockBuffer.cursor = [1, 7];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      // Verify useCompletion was called with the buffer
      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle single line slash command correctly', async () => {
      mockBuffer.text = '/memory';
      mockBuffer.lines = ['/memory'];
      mockBuffer.cursor = [0, 7];

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'show', value: 'show' }],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle Unicode characters (emojis) correctly in paths', async () => {
      // Test with emoji in path after @
      mockBuffer.text = '@src/file👍.txt';
      mockBuffer.lines = ['@src/file👍.txt'];
      mockBuffer.cursor = [0, 14]; // After the emoji character

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'file👍.txt', value: 'file👍.txt' }],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle Unicode characters with spaces after them', async () => {
      // Test with emoji followed by space - should NOT trigger completion
      mockBuffer.text = '@src/file👍.txt hello';
      mockBuffer.lines = ['@src/file👍.txt hello'];
      mockBuffer.cursor = [0, 20]; // After the space

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle escaped spaces in paths correctly', async () => {
      // Test with escaped space in path - should trigger completion
      mockBuffer.text = '@src/my\\ file.txt';
      mockBuffer.lines = ['@src/my\\ file.txt'];
      mockBuffer.cursor = [0, 16]; // After the escaped space and filename

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'my file.txt', value: 'my file.txt' }],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion after unescaped space following escaped space', async () => {
      // Test: @path/my\ file.txt hello (unescaped space after escaped space)
      mockBuffer.text = '@path/my\\ file.txt hello';
      mockBuffer.lines = ['@path/my\\ file.txt hello'];
      mockBuffer.cursor = [0, 24]; // After "hello"

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle multiple escaped spaces in paths', async () => {
      // Test with multiple escaped spaces
      mockBuffer.text = '@docs/my\\ long\\ file\\ name.md';
      mockBuffer.lines = ['@docs/my\\ long\\ file\\ name.md'];
      mockBuffer.cursor = [0, 29]; // At the end

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [
          { label: 'my long file name.md', value: 'my long file name.md' },
        ],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle escaped spaces in slash commands', async () => {
      // Test escaped spaces with slash commands (though less common)
      mockBuffer.text = '/memory\\ test';
      mockBuffer.lines = ['/memory\\ test'];
      mockBuffer.cursor = [0, 13]; // At the end

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'test-command', value: 'test-command' }],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle Unicode characters with escaped spaces', async () => {
      // Test combining Unicode and escaped spaces
      mockBuffer.text = '@' + path.join('files', 'emoji\\ 👍\\ test.txt');
      mockBuffer.lines = ['@' + path.join('files', 'emoji\\ 👍\\ test.txt')];
      mockBuffer.cursor = [0, 25]; // After the escaped space and emoji

      mockedUseCommandCompletion.mockReturnValue({
        ...mockCommandCompletion,
        showSuggestions: true,
        suggestions: [
          { label: 'emoji 👍 test.txt', value: 'emoji 👍 test.txt' },
        ],
      });

      const { unmount } = renderWithProviders(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCommandCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        false,
        expect.any(Object),
      );

      unmount();
    });
  });

  describe('vim mode', () => {
    it('should not call buffer.handleInput when vim mode is enabled and vim handles the input', async () => {
      props.vimModeEnabled = true;
      props.vimHandleInput = vi.fn().mockReturnValue(true); // Mock that vim handled it.
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('i');
      await wait();

      expect(props.vimHandleInput).toHaveBeenCalled();
      expect(mockBuffer.handleInput).not.toHaveBeenCalled();
      unmount();
    });

    it('should call buffer.handleInput when vim mode is enabled but vim does not handle the input', async () => {
      props.vimModeEnabled = true;
      props.vimHandleInput = vi.fn().mockReturnValue(false); // Mock that vim did NOT handle it.
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('i');
      await wait();

      expect(props.vimHandleInput).toHaveBeenCalled();
      expect(mockBuffer.handleInput).toHaveBeenCalled();
      unmount();
    });

    it('should call handleInput when vim mode is disabled', async () => {
      // Mock vimHandleInput to return false (vim didn't handle the input)
      props.vimHandleInput = vi.fn().mockReturnValue(false);
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('i');
      await wait();

      expect(props.vimHandleInput).toHaveBeenCalled();
      expect(mockBuffer.handleInput).toHaveBeenCalled();
      unmount();
    });
  });

  describe('unfocused paste', () => {
    it('should handle bracketed paste when not focused', async () => {
      props.focus = false;
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('\x1B[200~pasted text\x1B[201~');
      await wait();

      expect(mockBuffer.handleInput).toHaveBeenCalledWith(
        expect.objectContaining({
          paste: true,
          sequence: 'pasted text',
        }),
      );
      unmount();
    });

    it('should ignore regular keypresses when not focused', async () => {
      props.focus = false;
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('a');
      await wait();

      expect(mockBuffer.handleInput).not.toHaveBeenCalled();
      unmount();
    });
  });

  describe('Highlighting and Cursor Display', () => {
    it('should display cursor mid-word by highlighting the character', async () => {
      mockBuffer.text = 'hello world';
      mockBuffer.lines = ['hello world'];
      mockBuffer.viewportVisualLines = ['hello world'];
      mockBuffer.visualCursor = [0, 3]; // cursor on the second 'l'

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      // The component will render the text with the character at the cursor inverted.
      expect(frame).toContain(`hel${chalk.inverse('l')}o world`);
      unmount();
    });

    it('should display cursor at the beginning of the line', async () => {
      mockBuffer.text = 'hello';
      mockBuffer.lines = ['hello'];
      mockBuffer.viewportVisualLines = ['hello'];
      mockBuffer.visualCursor = [0, 0]; // cursor on 'h'

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`${chalk.inverse('h')}ello`);
      unmount();
    });

    it('should display cursor at the end of the line as an inverted space', async () => {
      mockBuffer.text = 'hello';
      mockBuffer.lines = ['hello'];
      mockBuffer.viewportVisualLines = ['hello'];
      mockBuffer.visualCursor = [0, 5]; // cursor after 'o'

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`hello${chalk.inverse(' ')}`);
      unmount();
    });

    it('should display cursor correctly on a highlighted token', async () => {
      mockBuffer.text = 'run @path/to/file';
      mockBuffer.lines = ['run @path/to/file'];
      mockBuffer.viewportVisualLines = ['run @path/to/file'];
      mockBuffer.visualCursor = [0, 9]; // cursor on 't' in 'to'

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      // The token '@path/to/file' is colored, and the cursor highlights one char inside it.
      expect(frame).toContain(`@path/${chalk.inverse('t')}o/file`);
      unmount();
    });

    it('should display cursor correctly for multi-byte unicode characters', async () => {
      const text = 'hello 👍 world';
      mockBuffer.text = text;
      mockBuffer.lines = [text];
      mockBuffer.viewportVisualLines = [text];
      mockBuffer.visualCursor = [0, 6]; // cursor on '👍'

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`hello ${chalk.inverse('👍')} world`);
      unmount();
    });

    it('should display cursor at the end of a line with unicode characters', async () => {
      const text = 'hello 👍';
      mockBuffer.text = text;
      mockBuffer.lines = [text];
      mockBuffer.viewportVisualLines = [text];
      mockBuffer.visualCursor = [0, 8]; // cursor after '👍' (length is 6 + 2 for emoji)

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`hello 👍${chalk.inverse(' ')}`);
      unmount();
    });

    it('should display cursor on an empty line', async () => {
      mockBuffer.text = '';
      mockBuffer.lines = [''];
      mockBuffer.viewportVisualLines = [''];
      mockBuffer.visualCursor = [0, 0];

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(chalk.inverse(' '));
      unmount();
    });

    it('should display cursor on a space between words', async () => {
      mockBuffer.text = 'hello world';
      mockBuffer.lines = ['hello world'];
      mockBuffer.viewportVisualLines = ['hello world'];
      mockBuffer.visualCursor = [0, 5]; // cursor on the space

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`hello${chalk.inverse(' ')}world`);
      unmount();
    });

    it('should display cursor in the middle of a line in a multiline block', async () => {
      const text = 'first line\nsecond line\nthird line';
      mockBuffer.text = text;
      mockBuffer.lines = text.split('\n');
      mockBuffer.viewportVisualLines = text.split('\n');
      mockBuffer.visualCursor = [1, 3]; // cursor on 'o' in 'second'
      mockBuffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
        [2, 0],
      ];

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`sec${chalk.inverse('o')}nd line`);
      unmount();
    });

    it('should display cursor at the beginning of a line in a multiline block', async () => {
      const text = 'first line\nsecond line';
      mockBuffer.text = text;
      mockBuffer.lines = text.split('\n');
      mockBuffer.viewportVisualLines = text.split('\n');
      mockBuffer.visualCursor = [1, 0]; // cursor on 's' in 'second'
      mockBuffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
      ];

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`${chalk.inverse('s')}econd line`);
      unmount();
    });

    it('should display cursor at the end of a line in a multiline block', async () => {
      const text = 'first line\nsecond line';
      mockBuffer.text = text;
      mockBuffer.lines = text.split('\n');
      mockBuffer.viewportVisualLines = text.split('\n');
      mockBuffer.visualCursor = [0, 10]; // cursor after 'first line'
      mockBuffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
      ];

      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain(`first line${chalk.inverse(' ')}`);
      unmount();
    });

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
      await wait();

      const frame = stdout.lastFrame();
      const lines = frame!.split('\n');
      // The line with the cursor should just be an inverted space inside the box border
      expect(
        lines.find((l) => l.includes(chalk.inverse(' '))),
      ).not.toBeUndefined();
      unmount();
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
      await wait();

      const frame = stdout.lastFrame();
      // Check that all lines, including the empty one, are rendered.
      // This implicitly tests that the Box wrapper provides height for the empty line.
      expect(frame).toContain('hello');
      expect(frame).toContain(`world${chalk.inverse(' ')}`);

      const outputLines = frame!.split('\n');
      // The number of lines should be 2 for the border plus 3 for the content.
      expect(outputLines.length).toBe(5);
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
      await wait();

      // Simulate a bracketed paste event from the terminal
      stdin.write(`\x1b[200~${pastedText}\x1b[201~`);
      await wait();

      // Verify that the buffer's handleInput was called once with the full text
      expect(props.buffer.handleInput).toHaveBeenCalledTimes(1);
      expect(props.buffer.handleInput).toHaveBeenCalledWith(
        expect.objectContaining({
          paste: true,
          sequence: pastedText,
        }),
      );

      unmount();
    });
  });

  describe('paste auto-submission protection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockedUseKittyKeyboardProtocol.mockReturnValue({ supported: false });
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
      await vi.runAllTimersAsync();

      // Simulate a paste operation (this should set the paste protection)
      stdin.write(`\x1b[200~pasted content\x1b[201~`);
      await vi.runAllTimersAsync();

      // Simulate an Enter key press immediately after paste
      stdin.write('\r');
      await vi.runAllTimersAsync();

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
      await vi.runAllTimersAsync();

      // Simulate a paste operation (this sets the protection)
      act(() => {
        stdin.write('\x1b[200~pasted text\x1b[201~');
      });
      await vi.runAllTimersAsync();

      // Advance timers past the protection timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Now Enter should work normally
      stdin.write('\r');
      await vi.runAllTimersAsync();

      expect(props.onSubmit).toHaveBeenCalledWith('pasted text');
      expect(props.buffer.newline).not.toHaveBeenCalled();

      unmount();
    });

    it.each([
      {
        name: 'kitty',
        setup: () =>
          mockedUseKittyKeyboardProtocol.mockReturnValue({ supported: true }),
      },
    ])(
      'should allow immediate submission for a trusted paste ($name)',
      async ({ setup }) => {
        setup();
        props.buffer.text = 'pasted command';

        const { stdin, unmount } = renderWithProviders(
          <InputPrompt {...props} />,
        );
        await vi.runAllTimersAsync();

        // Simulate a paste operation
        stdin.write('\x1b[200~some pasted stuff\x1b[201~');
        await vi.runAllTimersAsync();

        // Simulate an Enter key press immediately after paste
        stdin.write('\r');
        await vi.runAllTimersAsync();

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
      await vi.runAllTimersAsync();

      // Press Enter without any recent paste
      stdin.write('\r');
      await vi.runAllTimersAsync();

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
      );
      await wait();

      stdin.write('\x1B');
      await wait();

      stdin.write('\x1B');
      await wait();

      expect(props.buffer.setText).toHaveBeenCalledWith('');
      expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
      unmount();
    });

    it('should reset escape state on any non-ESC key', async () => {
      const onEscapePromptChange = vi.fn();
      props.onEscapePromptChange = onEscapePromptChange;
      props.buffer.setText('some text');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );

      stdin.write('\x1B');

      await waitFor(() => {
        expect(onEscapePromptChange).toHaveBeenCalledWith(true);
      });

      stdin.write('a');

      await waitFor(() => {
        expect(onEscapePromptChange).toHaveBeenCalledWith(false);
      });
      unmount();
    });

    it('should handle ESC in shell mode by disabling shell mode', async () => {
      props.shellModeActive = true;

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('\x1B');
      await wait();

      expect(props.setShellModeActive).toHaveBeenCalledWith(false);
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
      await wait();

      stdin.write('\x1B');
      await wait();

      expect(mockCommandCompletion.resetCompletionState).toHaveBeenCalled();
      unmount();
    });

    it('should not call onEscapePromptChange when not provided', async () => {
      props.onEscapePromptChange = undefined;
      props.buffer.setText('some text');

      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('\x1B');
      await wait();

      unmount();
    });

    it('should not interfere with existing keyboard shortcuts', async () => {
      const { stdin, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('\x0C');
      await wait();

      expect(props.onClearScreen).toHaveBeenCalled();

      stdin.write('\x01');
      await wait();

      expect(props.buffer.move).toHaveBeenCalledWith('home');
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
      await wait();

      // Trigger reverse search with Ctrl+R
      act(() => {
        stdin.write('\x12');
      });
      await wait();

      const frame = stdout.lastFrame();
      expect(frame).toContain('(r:)');
      expect(frame).toContain('echo hello');
      expect(frame).toContain('echo world');
      expect(frame).toContain('ls');

      unmount();
    });

    it('resets reverse search state on Escape', async () => {
      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();

      stdin.write('\x12');
      await wait();
      stdin.write('\x1B');

      await waitFor(() => {
        expect(stdout.lastFrame()).not.toContain('(r:)');
      });

      expect(stdout.lastFrame()).not.toContain('echo hello');

      unmount();
    });

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
      act(() => {
        stdin.write('\x12');
      });
      await wait();

      // Verify reverse search is active
      expect(stdout.lastFrame()).toContain('(r:)');

      // Press Tab to complete the highlighted entry
      act(() => {
        stdin.write('\t');
      });
      await wait();

      expect(mockHandleAutocomplete).toHaveBeenCalledWith(0);
      expect(props.buffer.setText).toHaveBeenCalledWith('echo hello');
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

      act(() => {
        stdin.write('\x12');
      });
      await wait();

      expect(stdout.lastFrame()).toContain('(r:)');

      act(() => {
        stdin.write('\r');
      });

      await waitFor(() => {
        expect(stdout.lastFrame()).not.toContain('(r:)');
      });

      expect(props.onSubmit).toHaveBeenCalledWith('echo hello');
      unmount();
    });

    it('text and cursor position should be restored after reverse search', async () => {
      props.buffer.setText('initial text');
      props.buffer.cursor = [0, 3];
      const { stdin, stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      stdin.write('\x12');
      await wait();
      expect(stdout.lastFrame()).toContain('(r:)');
      stdin.write('\x1B');

      await waitFor(() => {
        expect(stdout.lastFrame()).not.toContain('(r:)');
      });
      expect(props.buffer.text).toBe('initial text');
      expect(props.buffer.cursor).toEqual([0, 3]);

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
      await wait();

      stdin.write('\x05'); // Ctrl+E
      await wait();

      expect(props.buffer.move).toHaveBeenCalledWith('end');
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
      await wait();

      stdin.write('\x05'); // Ctrl+E
      await wait();

      expect(props.buffer.move).toHaveBeenCalledWith('end');
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
      await wait();

      act(() => {
        stdin.write('\x12'); // Ctrl+R
      });
      await wait();

      const frame = stdout.lastFrame() ?? '';
      expect(frame).toContain('(r:)');
      expect(frame).toContain('git commit');
      expect(frame).toContain('git push');
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
      await wait();

      stdin.write('\x12');
      await wait();

      expect(clean(stdout.lastFrame())).toContain('→');

      stdin.write('\u001B[C');
      await wait(200);
      expect(clean(stdout.lastFrame())).toContain('←');
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-expanded-match',
      );

      stdin.write('\u001B[D');
      await wait();
      expect(clean(stdout.lastFrame())).toContain('→');
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-collapsed-match',
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
      await wait();

      stdin.write('\x12');
      await wait();
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-collapsed-match',
      );

      stdin.write('\u001B[C');
      await wait();
      expect(stdout.lastFrame()).toMatchSnapshot(
        'command-search-expanded-match',
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
      await wait();

      stdin.write('\x12');
      await wait();

      const frame = clean(stdout.lastFrame());
      expect(frame).not.toContain('→');
      expect(frame).not.toContain('←');
      unmount();
    });
  });

  describe('snapshots', () => {
    it('should render correctly in shell mode', async () => {
      props.shellModeActive = true;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should render correctly when accepting edits', async () => {
      props.approvalMode = ApprovalMode.AUTO_EDIT;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should render correctly in yolo mode', async () => {
      props.approvalMode = ApprovalMode.YOLO;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should not show inverted cursor when shell is focused', async () => {
      props.isEmbeddedShellFocused = true;
      props.focus = false;
      const { stdout, unmount } = renderWithProviders(
        <InputPrompt {...props} />,
      );
      await wait();
      expect(stdout.lastFrame()).not.toContain(`{chalk.inverse(' ')}`);
      // This snapshot is good to make sure there was an input prompt but does
      // not show the inverted cursor because snapshots do not show colors.
      expect(stdout.lastFrame()).toMatchSnapshot();
      unmount();
    });
  });

  it('should still allow input when shell is not focused', async () => {
    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />, {
      shellFocus: false,
    });
    await wait();

    stdin.write('a');
    await wait();

    expect(mockBuffer.handleInput).toHaveBeenCalled();
    unmount();
  });
});
function clean(str: string | undefined): string {
  if (!str) return '';
  // Remove ANSI escape codes and trim whitespace
  return stripAnsi(str).trim();
}
