/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { render } from '../../test-utils/render.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as ink from 'ink';
import {
  SCREEN_READER_RESPONDING,
  SCREEN_READER_WAITING_FOR_CONFIRMATION,
} from '../textConstants.js';

vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

const useIsScreenReaderEnabledMock = vi.mocked(ink.useIsScreenReaderEnabled);

const renderWithContext = (
  ui: React.ReactElement,
  streamingStateValue: StreamingState,
) =>
  render(
    <StreamingContext.Provider value={streamingStateValue}>
      {ui}
    </StreamingContext.Provider>,
  );

describe('GeminiRespondingSpinner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should render responding alt text when Responding and screen reader is enabled', () => {
    useIsScreenReaderEnabledMock.mockReturnValue(true);
    const { lastFrame } = renderWithContext(
      <GeminiRespondingSpinner />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain(SCREEN_READER_RESPONDING);
  });

  it('should render waiting alt text when WaitingForConfirmation and screen reader is enabled', () => {
    useIsScreenReaderEnabledMock.mockReturnValue(true);
    const { lastFrame } = renderWithContext(
      <GeminiRespondingSpinner />,
      StreamingState.WaitingForConfirmation,
    );
    expect(lastFrame()).toContain(SCREEN_READER_WAITING_FOR_CONFIRMATION);
  });
});
