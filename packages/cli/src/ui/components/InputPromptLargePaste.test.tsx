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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCommandCompletion } from '../hooks/useCommandCompletion.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { useReverseSearchCompletion } from '../hooks/useReverseSearchCompletion.js';
import clipboardy from 'clipboardy';
import * as clipboardUtils from '../utils/clipboardUtils.js';
import { useKittyKeyboardProtocol } from '../hooks/useKittyKeyboardProtocol.js';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { StreamingState } from '../types.js';

vi.mock('../hooks/useShellHistory.js');
vi.mock('../hooks/useCommandCompletion.js');
vi.mock('../hooks/useInputHistory.js');
vi.mock('../hooks/useReverseSearchCompletion.js');
vi.mock('clipboardy');
vi.mock('../utils/clipboardUtils.js');
vi.mock('../hooks/useKittyKeyboardProtocol.js');

describe('InputPrompt Large Paste', () => {
  let props: InputPromptProps;
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(
      terminalCapabilityManager,
      'isBracketedPasteEnabled',
    ).mockReturnValue(true);

    mockBuffer = {
      text: '',
      cursor: [0, 0],
      lines: [''],
      setText: vi.fn((newText: string) => {
        mockBuffer.text = newText;
      }),
      replaceRangeByOffset: vi.fn(),
      viewportVisualLines: [''],
      allVisualLines: [''],
      visualCursor: [0, 0],
      visualScrollRow: 0,
      handleInput: vi.fn(),
      move: vi.fn(),
      moveToOffset: vi.fn(),
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
      // New props
      pastedContent: {},
      addPastedContent: vi.fn((text, lineCount) => {
        const id =
          lineCount > 5
            ? `[Pasted Text: ${lineCount} lines]`
            : `[Pasted Text: ${text.length} chars]`;
        mockBuffer.pastedContent[id] = text;
        return id;
      }),
    } as unknown as TextBuffer;

    vi.mocked(useShellHistory).mockReturnValue({
      history: [],
      addCommandToHistory: vi.fn(),
      getPreviousCommand: vi.fn(),
      getNextCommand: vi.fn(),
      resetHistoryPosition: vi.fn(),
    });

    vi.mocked(useCommandCompletion).mockReturnValue({
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
      getCommandFromSuggestion: vi.fn(),
      slashCompletionRange: {
        completionStart: -1,
        completionEnd: -1,
        getCommandFromSuggestion: vi.fn(),
        isArgumentCompletion: false,
        leafCommand: null,
      },
      getCompletedText: vi.fn(),
    });

    vi.mocked(useInputHistory).mockReturnValue({
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      handleSubmit: vi.fn(),
    });

    vi.mocked(useReverseSearchCompletion).mockReturnValue({
      suggestions: [],
      activeSuggestionIndex: -1,
      visibleStartIndex: 0,
      showSuggestions: false,
      isLoadingSuggestions: false,
      navigateUp: vi.fn(),
      navigateDown: vi.fn(),
      handleAutocomplete: vi.fn(),
      resetCompletionState: vi.fn(),
    });

    vi.mocked(useKittyKeyboardProtocol).mockReturnValue({
      enabled: false,
      checking: false,
    });

    props = {
      buffer: mockBuffer,
      onSubmit: vi.fn(),
      userMessages: [],
      onClearScreen: vi.fn(),
      config: {
        getProjectRoot: () => 'test/project',
        getTargetDir: () => 'test/project/src',
        getVimMode: () => false,
      } as unknown as Config,
      slashCommands: [],
      commandContext: createMockCommandContext(),
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

  it('should handle large clipboard paste (lines > 5) by calling buffer.insert', async () => {
    vi.mocked(clipboardUtils.clipboardHasImage).mockResolvedValue(false);
    const largeText = '1\n2\n3\n4\n5\n6';
    vi.mocked(clipboardy.read).mockResolvedValue(largeText);

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

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

    const { stdin, unmount } = renderWithProviders(<InputPrompt {...props} />);

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith(`Check this: ${largeText}`);
    });

    unmount();
  });
});
