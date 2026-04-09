/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { BtwDisplay } from './BtwDisplay.js';
import type { UIState } from '../contexts/UIStateContext.js';

describe('BtwDisplay', () => {
  const defaultMockUiState = {
    renderMarkdown: true,
  } as unknown as Partial<UIState>;

  it('renders nothing when query is empty', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <BtwDisplay
        query=""
        response=""
        isStreaming={false}
        error={null}
        terminalWidth={100}
      />,
      { uiState: defaultMockUiState },
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders query and response', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <BtwDisplay
        query="What is life?"
        response="Life is 42."
        isStreaming={false}
        error={null}
        terminalWidth={100}
      />,
      { uiState: defaultMockUiState },
    );
    const frame = lastFrame();
    expect(frame).toContain('What is life?');
    expect(frame).toContain('Life is 42.');
    expect(frame).toContain('BY THE WAY');
    unmount();
  });

  it('renders error message when error is provided', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <BtwDisplay
        query="What is life?"
        response="Life is 42."
        isStreaming={false}
        error="An API error occurred."
        terminalWidth={100}
      />,
      { uiState: defaultMockUiState },
    );
    const frame = lastFrame();
    expect(frame).toContain('An API error occurred.');
    expect(frame).not.toContain('Life is 42.');
    unmount();
  });

  it('renders a spinner and "Answering..." when streaming', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <BtwDisplay
        query="What is life?"
        response="Life is 42."
        isStreaming={true}
        error={null}
        terminalWidth={100}
      />,
      {
        uiState: defaultMockUiState,
      },
    );
    const frame = lastFrame();
    expect(frame).toContain('Answering...');
    unmount();
  });
});
