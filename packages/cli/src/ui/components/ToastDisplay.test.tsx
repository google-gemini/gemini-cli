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
      transientMessage: null,
      buffer: { text: '' } as TextBuffer,
      history: [] as HistoryItem[],
    };

    it('returns false for default state', () => {
      expect(shouldShowToast(baseState as UIState)).toBe(false);
    });

    it('returns true when transientMessage is present', () => {
      expect(
        shouldShowToast({
          ...baseState,
          transientMessage: { message: 'test', type: TransientMessageType.Hint },
        } as UIState),
      ).toBe(true);
    });
  });

  it('renders nothing by default', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay();
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
  });

  it('renders warning message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      transientMessage: {
        message: 'This is a warning',
        type: TransientMessageType.Warning,
      },
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders hint message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      transientMessage: {
        message: 'This is a hint',
        type: TransientMessageType.Hint,
      },
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Error transient message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      transientMessage: {
        message: 'Error Message',
        type: TransientMessageType.Error,
      },
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Hint transient message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      transientMessage: {
        message: 'Hint Message',
        type: TransientMessageType.Hint,
      },
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Accent transient message', async () => {
    const { lastFrame, waitUntilReady } = renderToastDisplay({
      transientMessage: {
        message: 'Accent Message',
        type: TransientMessageType.Accent,
      },
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
