/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { ToastDisplay, shouldShowToast } from './ToastDisplay.js';
import { TransientMessageType } from '../../utils/events.js';
import { type UIState } from '../contexts/UIStateContext.js';
import { type TextBuffer } from './shared/text-buffer.js';
import { type HistoryItem } from '../types.js';

const renderToastDisplay = (uiState: Partial<UIState> = {}) =>
  renderWithProviders(<ToastDisplay />, {
    uiState: {
      buffer: { text: '' } as TextBuffer,
      history: [] as HistoryItem[],
      ...uiState,
    },
  });

describe('ToastDisplay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldShowToast', () => {
    const baseState: Partial<UIState> = {
      ctrlCPressedOnce: false,
      transientMessage: null,
      ctrlDPressedOnce: false,
      showEscapePrompt: false,
      buffer: { text: '' } as TextBuffer,
      history: [] as HistoryItem[],
      queueErrorMessage: null,
      showIsExpandableHint: false,
    };

    it('returns false for default state', () => {
      expect(shouldShowToast(baseState as UIState)).toBe(false);
    });

    it('returns true when showIsExpandableHint is true', () => {
      expect(
        shouldShowToast({
          ...baseState,
          showIsExpandableHint: true,
        } as UIState),
      ).toBe(true);
    });

    it('returns true when ctrlCPressedOnce is true', () => {
      expect(
        shouldShowToast({ ...baseState, ctrlCPressedOnce: true } as UIState),
      ).toBe(true);
    });

    it('returns true when transientMessage is present', () => {
      expect(
        shouldShowToast({
          ...baseState,
          transientMessage: { text: 'test', type: TransientMessageType.Hint },
        } as UIState),
      ).toBe(true);
    });

    it('returns true when ctrlDPressedOnce is true', () => {
      expect(
        shouldShowToast({ ...baseState, ctrlDPressedOnce: true } as UIState),
      ).toBe(true);
    });

    it('returns true when showEscapePrompt is true and buffer is NOT empty', () => {
      expect(
        shouldShowToast({
          ...baseState,
          showEscapePrompt: true,
          buffer: { text: 'some text' } as TextBuffer,
        } as UIState),
      ).toBe(true);
    });

    it('returns true when showEscapePrompt is true and history is NOT empty', () => {
      expect(
        shouldShowToast({
          ...baseState,
          showEscapePrompt: true,
          history: [{ id: '1' } as unknown as HistoryItem],
        } as UIState),
      ).toBe(true);
    });

    it('returns false when showEscapePrompt is true but buffer and history are empty', () => {
      expect(
        shouldShowToast({
          ...baseState,
          showEscapePrompt: true,
        } as UIState),
      ).toBe(false);
    });

    it('returns true when queueErrorMessage is present', () => {
      expect(
        shouldShowToast({
          ...baseState,
          queueErrorMessage: 'error',
        } as UIState),
      ).toBe(true);
    });
  });

  it('renders nothing by default', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay();
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
  });

  it('renders Ctrl+C prompt', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      ctrlCPressedOnce: true,
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders warning message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      transientMessage: {
        text: 'This is a warning',
        type: TransientMessageType.Warning,
      },
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders hint message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      transientMessage: {
        text: 'This is a hint',
        type: TransientMessageType.Hint,
      },
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Ctrl+D prompt', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      ctrlDPressedOnce: true,
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Escape prompt when buffer is empty', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      showEscapePrompt: true,
      history: [{ id: 1, type: 'user', text: 'test' }] as HistoryItem[],
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Escape prompt when buffer is NOT empty', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      showEscapePrompt: true,
      buffer: { text: 'some text' } as TextBuffer,
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Queue Error Message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      queueErrorMessage: 'Queue Error',
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders expansion hint when showIsExpandableHint is true', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      showIsExpandableHint: true,
      constrainHeight: true,
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('Press Ctrl+O to show more lines');
  });

  it('renders collapse hint when showIsExpandableHint is true and constrainHeight is false', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      showIsExpandableHint: true,
      constrainHeight: false,
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('Press Ctrl+O to collapse lines');
  });
});
