/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { InputPrompt, InputPromptProps } from './InputPrompt.js';
import type { TextBuffer } from './shared/text-buffer.js';
import { Config } from '@google/gemini-cli-core';
import * as path from 'path';
import {
  CommandContext,
  SlashCommand,
  CommandKind,
} from '../commands/types.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useShellHistory,
  UseShellHistoryReturn,
} from '../hooks/useShellHistory.js';
import { useCompletion, UseCompletionReturn } from '../hooks/useCompletion.js';
import {
  useInputHistory,
  UseInputHistoryReturn,
} from '../hooks/useInputHistory.js';
import * as clipboardUtils from '../utils/clipboardUtils.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

vi.mock('../hooks/useShellHistory.js');
vi.mock('../hooks/useCompletion.js');
vi.mock('../hooks/useInputHistory.js');
vi.mock('../utils/clipboardUtils.js');

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
  let mockCompletion: UseCompletionReturn;
  let mockInputHistory: UseInputHistoryReturn;
  let mockBuffer: TextBuffer;
  let mockCommandContext: CommandContext;

  const mockedUseShellHistory = vi.mocked(useShellHistory);
  const mockedUseCompletion = vi.mocked(useCompletion);
  const mockedUseInputHistory = vi.mocked(useInputHistory);

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
      }),
      replaceRangeByOffset: vi.fn(),
      viewportVisualLines: [''],
      allVisualLines: [''],
      visualCursor: [0, 0],
      visualScrollRow: 0,
      handleInput: vi.fn(),
      move: vi.fn(),
      moveToOffset: vi.fn(),
      killLineRight: vi.fn(),
      killLineLeft: vi.fn(),
      openInExternalEditor: vi.fn(),
      newline: vi.fn(),
      backspace: vi.fn(),
      preferredCol: null,
      selectionAnchor: null,
      insert: vi.fn(),
      del: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      replaceRange: vi.fn(),
      deleteWordLeft: vi.fn(),
      deleteWordRight: vi.fn(),
    } as unknown as TextBuffer;

    mockShellHistory = {
      addCommandToHistory: vi.fn(),
      getPreviousCommand: vi.fn().mockReturnValue(null),
      getNextCommand: vi.fn().mockReturnValue(null),
      resetHistoryPosition: vi.fn(),
    };
    mockedUseShellHistory.mockReturnValue(mockShellHistory);

    mockCompletion = {
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
    };
    mockedUseCompletion.mockReturnValue(mockCompletion);

    mockInputHistory = {
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      handleSubmit: vi.fn(),
    };
    mockedUseInputHistory.mockReturnValue(mockInputHistory);

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
      inputWidth: 80,
      suggestionsWidth: 80,
      focus: true,
    };
  });

  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  it('should call shellHistory.getPreviousCommand on up arrow in shell mode', async () => {
    props.shellModeActive = true;
    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\u001B[A');
    await wait();

    expect(mockShellHistory.getPreviousCommand).toHaveBeenCalled();
    unmount();
  });

  it('should call shellHistory.getNextCommand on down arrow in shell mode', async () => {
    props.shellModeActive = true;
    const { stdin, unmount } = render(<InputPrompt {...props} />);
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
    const { stdin, unmount } = render(<InputPrompt {...props} />);
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
    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
    await wait();

    expect(mockShellHistory.addCommandToHistory).toHaveBeenCalledWith('ls -l');
    expect(props.onSubmit).toHaveBeenCalledWith('ls -l');
    unmount();
  });

  it('should NOT call shell history methods when not in shell mode', async () => {
    props.buffer.setText('some text');
    const { stdin, unmount } = render(<InputPrompt {...props} />);
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
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'memory', value: 'memory' },
        { label: 'memcache', value: 'memcache' },
      ],
    });

    props.buffer.setText('/mem');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    // Test up arrow
    stdin.write('\u001B[A'); // Up arrow
    await wait();

    stdin.write('\u0010'); // Ctrl+P
    await wait();
    expect(mockCompletion.navigateUp).toHaveBeenCalledTimes(2);
    expect(mockCompletion.navigateDown).not.toHaveBeenCalled();

    unmount();
  });

  it('should call completion.navigateDown for both down arrow and Ctrl+N when suggestions are showing', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'memory', value: 'memory' },
        { label: 'memcache', value: 'memcache' },
      ],
    });
    props.buffer.setText('/mem');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    // Test down arrow
    stdin.write('\u001B[B'); // Down arrow
    await wait();

    stdin.write('\u000E'); // Ctrl+N
    await wait();
    expect(mockCompletion.navigateDown).toHaveBeenCalledTimes(2);
    expect(mockCompletion.navigateUp).not.toHaveBeenCalled();

    unmount();
  });

  it('should NOT call completion navigation when suggestions are not showing', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: false,
    });
    props.buffer.setText('some text');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\u001B[A'); // Up arrow
    await wait();
    stdin.write('\u001B[B'); // Down arrow
    await wait();
    stdin.write('\u0010'); // Ctrl+P
    await wait();
    stdin.write('\u000E'); // Ctrl+N
    await wait();

    expect(mockCompletion.navigateUp).not.toHaveBeenCalled();
    expect(mockCompletion.navigateDown).not.toHaveBeenCalled();
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

      const { stdin, unmount } = render(<InputPrompt {...props} />);
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

      const { stdin, unmount } = render(<InputPrompt {...props} />);
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

      const { stdin, unmount } = render(<InputPrompt {...props} />);
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

      const { stdin, unmount } = render(<InputPrompt {...props} />);
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

      const { stdin, unmount } = render(<InputPrompt {...props} />);
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
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'memory', value: 'memory', description: '...' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/mem');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    expect(mockCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    unmount();
  });

  it('should append a sub-command when the parent command is already complete', async () => {
    // SCENARIO: /memory -> Tab (to accept 'add')
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeSuggestionIndex: 1, // 'add' is highlighted
    });
    props.buffer.setText('/memory ');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    expect(mockCompletion.handleAutocomplete).toHaveBeenCalledWith(1);
    unmount();
  });

  it('should handle the "backspace" edge case correctly', async () => {
    // SCENARIO: /memory -> Backspace -> /memory -> Tab (to accept 'show')
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeSuggestionIndex: 0, // 'show' is highlighted
    });
    // The user has backspaced, so the query is now just '/memory'
    props.buffer.setText('/memory');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    // It should NOT become '/show'. It should correctly become '/memory show'.
    expect(mockCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    unmount();
  });

  it('should complete a partial argument for a command', async () => {
    // SCENARIO: /chat resume fi- -> Tab
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'fix-foo', value: 'fix-foo' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/chat resume fi-');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab
    await wait();

    expect(mockCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    unmount();
  });

  it('should autocomplete on Enter when suggestions are active, without submitting', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'memory', value: 'memory' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/mem');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
    await wait();

    // The app should autocomplete the text, NOT submit.
    expect(mockCompletion.handleAutocomplete).toHaveBeenCalledWith(0);

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

    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'help', value: 'help' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/?');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t'); // Press Tab for autocomplete
    await wait();

    expect(mockCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    unmount();
  });

  it('should not submit on Enter when the buffer is empty or only contains whitespace', async () => {
    props.buffer.setText('   '); // Set buffer to whitespace

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r'); // Press Enter
    await wait();

    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should submit directly on Enter when isPerfectMatch is true', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: false,
      isPerfectMatch: true,
    });
    props.buffer.setText('/clear');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
    await wait();

    expect(props.onSubmit).toHaveBeenCalledWith('/clear');
    unmount();
  });

  it('should submit directly on Enter when a complete leaf command is typed', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: false,
      isPerfectMatch: false, // Added explicit isPerfectMatch false
    });
    props.buffer.setText('/clear');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
    await wait();

    expect(props.onSubmit).toHaveBeenCalledWith('/clear');
    unmount();
  });

  it('should autocomplete an @-path on Enter without submitting', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'index.ts', value: 'index.ts' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('@src/components/');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
    await wait();

    expect(mockCompletion.handleAutocomplete).toHaveBeenCalledWith(0);
    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should add a newline on enter when the line ends with a backslash', async () => {
    // This test simulates multi-line input, not submission
    mockBuffer.text = 'first line\\';
    mockBuffer.cursor = [0, 11];
    mockBuffer.lines = ['first line\\'];

    const { stdin, unmount } = render(<InputPrompt {...props} />);
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
    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\x03'); // Ctrl+C character
    await wait();

    expect(props.buffer.setText).toHaveBeenCalledWith('');
    expect(mockCompletion.resetCompletionState).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should NOT clear the buffer on Ctrl+C if it is empty', async () => {
    props.buffer.text = '';
    const { stdin, unmount } = render(<InputPrompt {...props} />);
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

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'Button.tsx', value: 'Button.tsx' }],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      // Verify useCompletion was called with correct signature
      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should trigger completion when cursor is after / without spaces', async () => {
      mockBuffer.text = '/memory';
      mockBuffer.lines = ['/memory'];
      mockBuffer.cursor = [0, 7];

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'show', value: 'show' }],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion when cursor is after space following @', async () => {
      mockBuffer.text = '@src/file.ts hello';
      mockBuffer.lines = ['@src/file.ts hello'];
      mockBuffer.cursor = [0, 18];

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion when cursor is after space following /', async () => {
      mockBuffer.text = '/memory add';
      mockBuffer.lines = ['/memory add'];
      mockBuffer.cursor = [0, 11];

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion when cursor is not after @ or /', async () => {
      mockBuffer.text = 'hello world';
      mockBuffer.lines = ['hello world'];
      mockBuffer.cursor = [0, 5];

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle multiline text correctly', async () => {
      mockBuffer.text = 'first line\n/memory';
      mockBuffer.lines = ['first line', '/memory'];
      mockBuffer.cursor = [1, 7];

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      // Verify useCompletion was called with the buffer
      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle single line slash command correctly', async () => {
      mockBuffer.text = '/memory';
      mockBuffer.lines = ['/memory'];
      mockBuffer.cursor = [0, 7];

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'show', value: 'show' }],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle Unicode characters (emojis) correctly in paths', async () => {
      // Test with emoji in path after @
      mockBuffer.text = '@src/file👍.txt';
      mockBuffer.lines = ['@src/file👍.txt'];
      mockBuffer.cursor = [0, 14]; // After the emoji character

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'file👍.txt', value: 'file👍.txt' }],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle Unicode characters with spaces after them', async () => {
      // Test with emoji followed by space - should NOT trigger completion
      mockBuffer.text = '@src/file👍.txt hello';
      mockBuffer.lines = ['@src/file👍.txt hello'];
      mockBuffer.cursor = [0, 20]; // After the space

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle escaped spaces in paths correctly', async () => {
      // Test with escaped space in path - should trigger completion
      mockBuffer.text = '@src/my\\ file.txt';
      mockBuffer.lines = ['@src/my\\ file.txt'];
      mockBuffer.cursor = [0, 16]; // After the escaped space and filename

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'my file.txt', value: 'my file.txt' }],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should NOT trigger completion after unescaped space following escaped space', async () => {
      // Test: @path/my\ file.txt hello (unescaped space after escaped space)
      mockBuffer.text = '@path/my\\ file.txt hello';
      mockBuffer.lines = ['@path/my\\ file.txt hello'];
      mockBuffer.cursor = [0, 24]; // After "hello"

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
        suggestions: [],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle multiple escaped spaces in paths', async () => {
      // Test with multiple escaped spaces
      mockBuffer.text = '@docs/my\\ long\\ file\\ name.md';
      mockBuffer.lines = ['@docs/my\\ long\\ file\\ name.md'];
      mockBuffer.cursor = [0, 29]; // At the end

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [
          { label: 'my long file name.md', value: 'my long file name.md' },
        ],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle escaped spaces in slash commands', async () => {
      // Test escaped spaces with slash commands (though less common)
      mockBuffer.text = '/memory\\ test';
      mockBuffer.lines = ['/memory\\ test'];
      mockBuffer.cursor = [0, 13]; // At the end

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [{ label: 'test-command', value: 'test-command' }],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle Unicode characters with escaped spaces', async () => {
      // Test combining Unicode and escaped spaces
      mockBuffer.text = '@' + path.join('files', 'emoji\\ 👍\\ test.txt');
      mockBuffer.lines = ['@' + path.join('files', 'emoji\\ 👍\\ test.txt')];
      mockBuffer.cursor = [0, 25]; // After the escaped space and emoji

      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: true,
        suggestions: [
          { label: 'emoji 👍 test.txt', value: 'emoji 👍 test.txt' },
        ],
      });

      const { unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        mockBuffer,
        ['/test/project/src'],
        path.join('test', 'project', 'src'),
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });
  });

  describe('vim mode', () => {
    it('should not call buffer.handleInput when vim mode is enabled and vim handles the input', async () => {
      props.vimModeEnabled = true;
      props.vimHandleInput = vi.fn().mockReturnValue(true); // Mock that vim handled it.
      const { stdin, unmount } = render(<InputPrompt {...props} />);
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
      const { stdin, unmount } = render(<InputPrompt {...props} />);
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
      const { stdin, unmount } = render(<InputPrompt {...props} />);
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
      const { stdin, unmount } = render(<InputPrompt {...props} />);
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
      const { stdin, unmount } = render(<InputPrompt {...props} />);
      await wait();

      stdin.write('a');
      await wait();

      expect(mockBuffer.handleInput).not.toHaveBeenCalled();
      unmount();
    });
  });
});
