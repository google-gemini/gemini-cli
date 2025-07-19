/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { InputPrompt, InputPromptProps } from './InputPrompt.js';
import type { TextBuffer } from './shared/text-buffer.js';
import { Config } from '@google/gemini-cli-core';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import * as clipboardUtils from '../utils/clipboardUtils.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

vi.mock('../hooks/useShellHistory.js');
vi.mock('../hooks/useCompletion.js');
vi.mock('../hooks/useInputHistory.js');
vi.mock('../utils/clipboardUtils.js');

// Mock chalk.inverse to make highlighting detectable in plain text output
vi.mock('chalk', () => ({
  default: {
    inverse: vi.fn((text: string) => `[${text}]`), // Wrap the character in brackets
  },
}));

type MockedUseShellHistory = ReturnType<typeof useShellHistory>;
type MockedUseCompletion = ReturnType<typeof useCompletion>;
type MockedUseInputHistory = ReturnType<typeof useInputHistory>;

const mockSlashCommands: SlashCommand[] = [
  { name: 'clear', description: 'Clear screen', action: vi.fn() },
  {
    name: 'memory',
    description: 'Manage memory',
    subCommands: [
      { name: 'show', description: 'Show memory', action: vi.fn() },
      { name: 'add', description: 'Add to memory', action: vi.fn() },
      { name: 'refresh', description: 'Refresh memory', action: vi.fn() },
    ],
  },
  {
    name: 'chat',
    description: 'Manage chats',
    subCommands: [
      {
        name: 'resume',
        description: 'Resume a chat',
        action: vi.fn(),
        completion: async () => ['fix-foo', 'fix-bar'],
      },
    ],
  },
];

describe('InputPrompt', () => {
  let props: InputPromptProps;
  let mockShellHistory: MockedUseShellHistory;
  let mockCompletion: MockedUseCompletion;
  let mockInputHistory: MockedUseInputHistory;
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
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      resetCompletionState: vi.fn(),
      setActiveSuggestionIndex: vi.fn(),
      setShowSuggestions: vi.fn(),
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
        getProjectRoot: () => '/test/project',
        getTargetDir: () => '/test/project/src',
      } as unknown as Config,
      slashCommands: [],
      commandContext: mockCommandContext,
      shellModeActive: false,
      setShellModeActive: vi.fn(),
      inputWidth: 80,
      suggestionsWidth: 80,
      focus: true,
    };

    props.slashCommands = mockSlashCommands;
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

  describe('cursor highlighting behavior', () => {
    it('should show cursor highlighting when focused and hide it when unfocused', async () => {
      // Set up buffer with text content where cursor highlighting would be visible
      mockBuffer.text = 'test';
      mockBuffer.lines = ['test'];
      mockBuffer.viewportVisualLines = ['test'];
      mockBuffer.visualCursor = [0, 1]; // Position cursor on 'e'

      // Start with focus=true
      props.focus = true;
      const { lastFrame, rerender, unmount } = render(
        <InputPrompt {...props} />,
      );

      try {
        await wait();
        const focusedOutput = lastFrame();

        // Test with focus=false - cursor highlighting should NOT be visible
        props.focus = false;
        rerender(<InputPrompt {...props} />);
        await wait();
        const unfocusedOutput = lastFrame();

        // Both should contain the base text, but focused output should show the mocked highlight
        expect(focusedOutput).toContain('t[e]st'); // Assuming cursor on 'e' in 'test'
        expect(unfocusedOutput).toContain('test');
        expect(unfocusedOutput).not.toContain('t[e]st'); // Ensure unfocused doesn't have the highlight
        expect(focusedOutput).not.toEqual(unfocusedOutput); // Crucial: outputs must be different

        // The outputs should be defined and non-empty (keep these if desired, but the above are more specific)
        expect(focusedOutput).toBeDefined();
        expect(unfocusedOutput).toBeDefined();
        expect(focusedOutput?.length).toBeGreaterThan(0);
        expect(unfocusedOutput?.length).toBeGreaterThan(0);
      } finally {
        unmount();
      }
    });

    it('should handle placeholder rendering with focus states', async () => {
      props.placeholder = 'Type here';
      mockBuffer.text = '';
      mockBuffer.lines = [''];
      mockBuffer.viewportVisualLines = [''];

      // Start with focus=true
      props.focus = true;
      const { lastFrame, rerender, unmount } = render(
        <InputPrompt {...props} />,
      );

      try {
        await wait();
        const focusedOutput = lastFrame();

        // Test unfocused state - placeholder logic with focus=false
        props.focus = false;
        rerender(<InputPrompt {...props} />);
        await wait();
        const unfocusedOutput = lastFrame();

        // Validate that both contain the placeholder text (with mocked highlighting for focused)
        expect(focusedOutput).toContain('[T]ype here'); // First character highlighted when focused
        expect(unfocusedOutput).toContain('Type here');
        expect(unfocusedOutput).not.toContain('[T]ype here');
        expect(focusedOutput).not.toEqual(unfocusedOutput); // Ensure outputs differ

        // Validate both states render successfully
        expect(focusedOutput).toBeDefined();
        expect(unfocusedOutput).toBeDefined();

        // The placeholder logic already properly handles focus conditionally
        // This test ensures our fix doesn't break placeholder rendering
      } finally {
        unmount();
      }
    });

    it('should handle text input with different focus states', async () => {
      mockBuffer.text = 'test';
      mockBuffer.lines = ['test'];
      mockBuffer.viewportVisualLines = ['test'];
      mockBuffer.visualCursor = [0, 1];

      // Start with focus=true
      props.focus = true;
      const { lastFrame, rerender, unmount } = render(
        <InputPrompt {...props} />,
      );

      try {
        await wait();
        const focusedOutput = lastFrame();

        // Test with focus=false
        props.focus = false;
        rerender(<InputPrompt {...props} />);
        await wait();
        const unfocusedOutput = lastFrame();

        // Both should contain the text, but focused should have highlighting
        expect(focusedOutput).toContain('t[e]st'); // Cursor on 'e' should be highlighted
        expect(unfocusedOutput).toContain('test');
        expect(unfocusedOutput).not.toContain('t[e]st');
        expect(focusedOutput).not.toEqual(unfocusedOutput); // Ensure outputs differ
      } finally {
        unmount();
      }
    });

    it('should not crash when focus changes during rendering', async () => {
      props.focus = true;
      mockBuffer.text = 'hello world';
      mockBuffer.lines = ['hello world'];
      mockBuffer.viewportVisualLines = ['hello world'];
      mockBuffer.visualCursor = [0, 5];

      const { rerender, lastFrame, unmount } = render(
        <InputPrompt {...props} />,
      );
      await wait();

      const initialOutput = lastFrame();
      expect(initialOutput).toContain('hello[ ]world'); // Space is highlighted when focused

      // Change focus and re-render
      props.focus = false;
      rerender(<InputPrompt {...props} />);
      await wait();

      const updatedOutput = lastFrame();
      expect(updatedOutput).toContain('hello world');

      unmount();
    });

    it('should properly handle cursor highlighting during focus transitions', async () => {
      // This test validates that cursor highlighting toggles correctly during focus changes

      // Set up a scenario where cursor highlighting logic would be triggered
      mockBuffer.text = 'hello world';
      mockBuffer.lines = ['hello world'];
      mockBuffer.viewportVisualLines = ['hello world'];
      mockBuffer.visualCursor = [0, 5]; // Position cursor on the space between words

      // Start with focus=true
      props.focus = true;
      const { rerender, lastFrame, unmount } = render(
        <InputPrompt {...props} />,
      );
      await wait();
      const focusedOutput = lastFrame();

      // Transition to focus=false
      props.focus = false;
      rerender(<InputPrompt {...props} />);
      await wait();
      const unfocusedOutput = lastFrame();

      // Transition back to focus=true
      props.focus = true;
      rerender(<InputPrompt {...props} />);
      await wait();
      const refocusedOutput = lastFrame();

      unmount();

      // All states should render the text content
      expect(focusedOutput).toContain('hello[ ]world'); // Space highlighted when focused
      expect(unfocusedOutput).toContain('hello world');
      expect(unfocusedOutput).not.toContain('hello[ ]world'); // No highlighting when unfocused
      expect(refocusedOutput).toContain('hello[ ]world'); // Space highlighted again when refocused

      // Ensure no crashes during focus transitions
      expect(focusedOutput).toBeDefined();
      expect(unfocusedOutput).toBeDefined();
      expect(refocusedOutput).toBeDefined();
    });
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
      vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(true);
      vi.mocked(clipboardUtils.saveClipboardImage).mockResolvedValue(
        '/test/.gemini-clipboard/clipboard-456.png',
      );

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
      expect(actualCall[2]).toMatch(
        /@.*\.gemini-clipboard\/clipboard-456\.png/,
      ); // flexible path match
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

    expect(props.buffer.setText).toHaveBeenCalledWith('/memory');
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

    expect(props.buffer.setText).toHaveBeenCalledWith('/memory add');
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
    expect(props.buffer.setText).toHaveBeenCalledWith('/memory show');
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

    expect(props.buffer.setText).toHaveBeenCalledWith('/chat resume fix-foo');
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
    expect(props.buffer.setText).toHaveBeenCalledWith('/memory');

    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should complete a command based on its altName', async () => {
    // Add a command with an altName to our mock for this test
    props.slashCommands.push({
      name: 'help',
      altName: '?',
      description: '...',
      action: vi.fn(),
    });

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

    expect(props.buffer.setText).toHaveBeenCalledWith('/help');
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

  it('should submit directly on Enter when a complete leaf command is typed', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: false,
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

    expect(props.buffer.replaceRangeByOffset).toHaveBeenCalled();
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

      // Verify useCompletion was called with true (should show completion)
      expect(mockedUseCompletion).toHaveBeenCalledWith(
        '@src/components',
        '/test/project/src',
        true, // shouldShowCompletion should be true
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
        '/memory',
        '/test/project/src',
        true, // shouldShowCompletion should be true
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
        '@src/file.ts hello',
        '/test/project/src',
        false, // shouldShowCompletion should be false
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
        '/memory add',
        '/test/project/src',
        false, // shouldShowCompletion should be false
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
        'hello world',
        '/test/project/src',
        false, // shouldShowCompletion should be false
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

      expect(mockedUseCompletion).toHaveBeenCalledWith(
        'first line\n/memory',
        '/test/project/src',
        false, // shouldShowCompletion should be false (isSlashCommand returns false because text doesn't start with /)
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
        '/memory',
        '/test/project/src',
        true, // shouldShowCompletion should be true (isSlashCommand returns true AND cursor is after / without space)
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
        '@src/file👍.txt',
        '/test/project/src',
        true, // shouldShowCompletion should be true
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
        '@src/file👍.txt hello',
        '/test/project/src',
        false, // shouldShowCompletion should be false
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
        '@src/my\\ file.txt',
        '/test/project/src',
        true, // shouldShowCompletion should be true
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
        '@path/my\\ file.txt hello',
        '/test/project/src',
        false, // shouldShowCompletion should be false
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
        '@docs/my\\ long\\ file\\ name.md',
        '/test/project/src',
        true, // shouldShowCompletion should be true
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
        '/memory\\ test',
        '/test/project/src',
        true, // shouldShowCompletion should be true
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });

    it('should handle Unicode characters with escaped spaces', async () => {
      // Test combining Unicode and escaped spaces
      mockBuffer.text = '@files/emoji\\ 👍\\ test.txt';
      mockBuffer.lines = ['@files/emoji\\ 👍\\ test.txt'];
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
        '@files/emoji\\ 👍\\ test.txt',
        '/test/project/src',
        true, // shouldShowCompletion should be true
        mockSlashCommands,
        mockCommandContext,
        expect.any(Object),
      );

      unmount();
    });
  });
});
