/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { InputPrompt, InputPromptProps } from './InputPrompt.js';
import type { TextBuffer } from './shared/text-buffer.js';
import { Config } from '@google/gemini-cli-core';
import { vi } from 'vitest';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import * as clipboardUtils from '../utils/clipboardUtils.js';

vi.mock('../hooks/useShellHistory.js');
vi.mock('../hooks/useCompletion.js');
vi.mock('../hooks/useInputHistory.js');
vi.mock('../utils/clipboardUtils.js');

type MockedUseShellHistory = ReturnType<typeof useShellHistory>;
type MockedUseCompletion = ReturnType<typeof useCompletion>;
type MockedUseInputHistory = ReturnType<typeof useInputHistory>;

describe('InputPrompt', () => {
  let props: InputPromptProps;
  let mockShellHistory: MockedUseShellHistory;
  let mockCompletion: MockedUseCompletion;
  let mockInputHistory: MockedUseInputHistory;
  let mockBuffer: TextBuffer;

  const mockedUseShellHistory = vi.mocked(useShellHistory);
  const mockedUseCompletion = vi.mocked(useCompletion);
  const mockedUseInputHistory = vi.mocked(useInputHistory);

  beforeEach(() => {
    vi.resetAllMocks();

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
});
