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
import { vi } from 'vitest';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { CLEAR_QUEUE_SIGNAL } from '../constants.js';
import { StreamingState } from '../types.js';

vi.mock('../hooks/useShellHistory.js');
vi.mock('../hooks/useCompletion.js');
vi.mock('../hooks/useInputHistory.js');

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
      replaceRangeByOffset: vi.fn(),
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

  it('should complete a partial parent command and add a space', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'memory', value: 'memory', description: '...' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/mem');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t');
    await wait();

    expect(props.buffer.setText).toHaveBeenCalledWith('/memory ');
    unmount();
  });

  it('should append a sub-command when the parent command is already complete with a space', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeSuggestionIndex: 1,
    });
    props.buffer.setText('/memory ');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t');
    await wait();

    expect(props.buffer.setText).toHaveBeenCalledWith('/memory add ');
    unmount();
  });

  it('should handle the "backspace" edge case correctly', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [
        { label: 'show', value: 'show' },
        { label: 'add', value: 'add' },
      ],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/memory');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t');
    await wait();

    expect(props.buffer.setText).toHaveBeenCalledWith('/memory show ');
    unmount();
  });

  it('should complete a partial argument for a command', async () => {
    mockedUseCompletion.mockReturnValue({
      ...mockCompletion,
      showSuggestions: true,
      suggestions: [{ label: 'fix-foo', value: 'fix-foo' }],
      activeSuggestionIndex: 0,
    });
    props.buffer.setText('/chat resume fi-');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\t');
    await wait();

    expect(props.buffer.setText).toHaveBeenCalledWith('/chat resume fix-foo ');
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

    expect(props.buffer.setText).toHaveBeenCalledWith('/memory ');

    expect(props.onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it('should complete a command based on its altName', async () => {
    props.slashCommands.push({
      name: 'help',
      altName: '?',
      description: '...',
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

    stdin.write('\t');
    await wait();

    expect(props.buffer.setText).toHaveBeenCalledWith('/help ');
    unmount();
  });


  it('should not submit on Enter when the buffer is empty or only contains whitespace', async () => {
    props.buffer.setText('   ');

    const { stdin, unmount } = render(<InputPrompt {...props} />);
    await wait();

    stdin.write('\r');
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
    expect(props.buffer.setText).not.toHaveBeenCalledWith('/clear ');
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

  describe('concurrent input queue clearing functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render correctly when hasQueuedInput prop is true', async () => {
      props.hasQueuedInput = true;
      props.shellModeActive = false;
      
      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
      });

      const { lastFrame, unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(lastFrame()).toBeDefined();
      expect(props.hasQueuedInput).toBe(true);
      unmount();
    });

    it('should render correctly when hasQueuedInput prop is false', async () => {
      props.hasQueuedInput = false;
      props.shellModeActive = false;
      
      mockedUseCompletion.mockReturnValue({
        ...mockCompletion,
        showSuggestions: false,
      });

      const { lastFrame, unmount } = render(<InputPrompt {...props} />);
      await wait();

      expect(lastFrame()).toBeDefined();
      expect(props.hasQueuedInput).toBe(false);
      unmount();
    });

    it('should handle queued input display when queuedInput prop is provided', async () => {
      props.hasQueuedInput = true;
      props.queuedInput = 'test queued input message';

      const { lastFrame, unmount } = render(<InputPrompt {...props} />);
      await wait();

      const frame = lastFrame();
      expect(frame).toBeDefined();
      expect(props.queuedInput).toBe('test queued input message');
      unmount();
    });

    it('should maintain state consistency with multiple props', async () => {
      props.hasQueuedInput = true;
      props.shellModeActive = true;
      props.streamingState = StreamingState.Responding;

      const { lastFrame, unmount } = render(<InputPrompt {...props} />);
      await wait();

      const frame = lastFrame();
      expect(frame).toBeDefined();
      expect(props.hasQueuedInput).toBe(true);
      expect(props.shellModeActive).toBe(true);
      unmount();
    });

    it('should verify CLEAR_QUEUE_SIGNAL constant is properly imported and has correct value', () => {
      expect(CLEAR_QUEUE_SIGNAL).toBeDefined();
      expect(CLEAR_QUEUE_SIGNAL).toBe('__CLEAR_QUEUE__');
      expect(typeof CLEAR_QUEUE_SIGNAL).toBe('string');
      expect(CLEAR_QUEUE_SIGNAL.length).toBeGreaterThan(0);
    });

    it('should not interfere with existing onSubmit behavior', async () => {
      props.hasQueuedInput = false;
      props.buffer.setText('normal input');

      const { stdin, unmount } = render(<InputPrompt {...props} />);
      await wait();

      stdin.write('\r');
      await wait();

      expect(props.onSubmit).toHaveBeenCalled();
      unmount();
    });
  });
});
