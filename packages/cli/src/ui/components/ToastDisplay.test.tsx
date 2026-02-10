/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils/render.js';
import { ToastDisplay } from './ToastDisplay.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import type { TextBuffer } from './shared/text-buffer.js';

// Use a type that allows partial buffer for mocking purposes
type UIStateOverrides = Partial<Omit<UIState, 'buffer'>> & {
  buffer?: Partial<TextBuffer>;
};

// Create mock context providers
const createMockUIState = (overrides: UIStateOverrides = {}): UIState =>
  ({
    ctrlCPressedOnce: false,
    warningMessage: null,
    ctrlDPressedOnce: false,
    showEscapePrompt: false,
    queueErrorMessage: null,
    buffer: { text: '' },
    history: [{ id: 1, type: 'user', text: 'test' }],
    ...overrides,
  }) as UIState;

const renderToastDisplay = (uiState: UIState = createMockUIState()) =>
  render(
    <UIStateContext.Provider value={uiState}>
      <ToastDisplay />
    </UIStateContext.Provider>,
  );

describe('ToastDisplay', () => {
  it('renders nothing by default', () => {
    const { lastFrame } = renderToastDisplay();
    expect(lastFrame()).toBe('');
  });

  it('renders Ctrl+C prompt', () => {
    const uiState = createMockUIState({
      ctrlCPressedOnce: true,
    });
    const { lastFrame } = renderToastDisplay(uiState);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders warning message', () => {
    const uiState = createMockUIState({
      warningMessage: 'This is a warning',
    });
    const { lastFrame } = renderToastDisplay(uiState);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Ctrl+D prompt', () => {
    const uiState = createMockUIState({
      ctrlDPressedOnce: true,
    });
    const { lastFrame } = renderToastDisplay(uiState);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Escape prompt when buffer is empty', () => {
    const uiState = createMockUIState({
      showEscapePrompt: true,
      buffer: { text: '' },
    });
    const { lastFrame } = renderToastDisplay(uiState);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Escape prompt when buffer is NOT empty', () => {
    const uiState = createMockUIState({
      showEscapePrompt: true,
      buffer: { text: 'some text' },
    });
    const { lastFrame } = renderToastDisplay(uiState);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Queue Error Message', () => {
    const uiState = createMockUIState({
      queueErrorMessage: 'Queue Error',
    });
    const { lastFrame } = renderToastDisplay(uiState);
    expect(lastFrame()).toMatchSnapshot();
  });
});
