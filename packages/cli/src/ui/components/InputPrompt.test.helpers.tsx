/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { vi } from 'vitest';
import { ApprovalMode, coreEvents, type Config } from '@google/gemini-cli-core';
import * as path from 'node:path';
import { CommandKind, type SlashCommand } from '../commands/types.js';
import { StreamingState } from '../types.js';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
import { type TextBuffer } from './shared/text-buffer.js';
import { cpLen } from '../utils/textUtils.js';
import { InputContext } from '../contexts/InputContext.js';
import { InputPrompt, type InputPromptProps } from './InputPrompt.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

export type TestInputPromptProps = InputPromptProps & {
  buffer: TextBuffer;
  userMessages: string[];
  shellModeActive: boolean;
  copyModeEnabled?: boolean;
  showEscapePrompt?: boolean;
  inputWidth: number;
  suggestionsWidth: number;
};

export const TestInputPrompt = (props: TestInputPromptProps) => {
  const contextValue = useMemo(
    () => ({
      buffer: props.buffer,
      userMessages: props.userMessages,
      shellModeActive: props.shellModeActive,
      copyModeEnabled: props.copyModeEnabled,
      showEscapePrompt: props.showEscapePrompt || false,
      inputWidth: props.inputWidth,
      suggestionsWidth: props.suggestionsWidth,
    }),
    [
      props.buffer,
      props.userMessages,
      props.shellModeActive,
      props.copyModeEnabled,
      props.showEscapePrompt,
      props.inputWidth,
      props.suggestionsWidth,
    ],
  );

  return (
    <InputContext.Provider value={contextValue}>
      <InputPrompt {...props} />
    </InputContext.Provider>
  );
};

export const mockSlashCommands: SlashCommand[] = [
  {
    name: 'stats',
    description: 'Check stats',
    kind: CommandKind.BUILT_IN,
    isSafeConcurrent: true,
  },
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

export function setupInputPromptTest() {
  vi.resetAllMocks();
  coreEvents.removeAllListeners();
  vi.spyOn(terminalCapabilityManager, 'isKittyProtocolEnabled').mockReturnValue(
    true,
  );

  const mockCommandContext = createMockCommandContext();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const mockBuffer = {
    text: '',
    cursor: [0, 0],
    lines: [''],
    setText: vi.fn(
      (newText: string, cursorPosition?: 'start' | 'end' | number) => {
        mockBuffer.text = newText;
        mockBuffer.lines = newText.split('\n');
        let col = 0;
        if (typeof cursorPosition === 'number') {
          col = cursorPosition;
        } else if (cursorPosition === 'start') {
          col = 0;
        } else {
          col = newText.length;
        }
        mockBuffer.cursor = [0, col];
        mockBuffer.allVisualLines = newText.split('\n');
        mockBuffer.viewportVisualLines = newText.split('\n');
        mockBuffer.visualToLogicalMap = newText
          .split('\n')
          .map((_, i) => [i, 0] as [number, number]);
        mockBuffer.visualCursor = [0, col];
        mockBuffer.visualScrollRow = 0;
        mockBuffer.viewportHeight = 10;
        mockBuffer.visualToTransformedMap = newText
          .split('\n')
          .map((_, i) => i);
        mockBuffer.transformationsByLine = newText.split('\n').map(() => []);
      },
    ),
    replaceRangeByOffset: vi.fn(),
    viewportVisualLines: [''],
    allVisualLines: [''],
    visualCursor: [0, 0],
    visualScrollRow: 0,
    viewportHeight: 10,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleInput: vi.fn((key: any) => {
      if (key.name === 'c' && key.ctrl) {
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

  const props: TestInputPromptProps = {
    onQueueMessage: vi.fn(),
    buffer: mockBuffer,
    onSubmit: vi.fn(),
    userMessages: [],
    onClearScreen: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    config: {
      getProjectRoot: () => path.join('test', 'project'),
      getTargetDir: () => path.join('test', 'project', 'src'),
      getVimMode: () => false,
      getUseBackgroundColor: () => true,
      getUseTerminalBuffer: () => false,
      getTerminalBackground: () => undefined,
      getWorkspaceContext: () => ({
        getDirectories: () => ['/test/project/src'],
        onDirectoriesChanged: vi.fn(),
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

  const uiActions = {
    setEmbeddedShellFocused: vi.fn(),
    setCleanUiDetailsVisible: vi.fn(),
    toggleCleanUiDetailsVisible: vi.fn(),
    revealCleanUiDetailsTemporarily: vi.fn(),
    addMessage: vi.fn(),
  };

  return {
    mockBuffer,
    props,
    uiActions,
    mockCommandContext,
  };
}

export function createMockMocks() {
  return {
    mockSetEmbeddedShellFocused: vi.fn(),
    mockSetCleanUiDetailsVisible: vi.fn(),
    mockToggleCleanUiDetailsVisible: vi.fn(),
    mockRevealCleanUiDetailsTemporarily: vi.fn(),
  };
}
