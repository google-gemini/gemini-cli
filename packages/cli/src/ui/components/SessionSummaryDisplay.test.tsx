/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import { type CumulativeStats } from '../contexts/SessionContext.js';

describe('<SessionSummaryDisplay />', () => {
  const mockStats: CumulativeStats = {
    turnCount: 10,
    promptTokenCount: 1000,
    candidatesTokenCount: 2000,
    totalTokenCount: 3500,
    cachedContentTokenCount: 500,
    toolUsePromptTokenCount: 200,
    thoughtsTokenCount: 300,
    apiTimeMs: 50234,
  };

  const mockDuration = '1h 23m 45s';

  it('renders correctly with given stats and duration', () => {
    const { lastFrame } = render(
      <SessionSummaryDisplay stats={mockStats} duration={mockDuration} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders zero state correctly', () => {
    const zeroStats: CumulativeStats = {
      turnCount: 0,
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
      cachedContentTokenCount: 0,
      toolUsePromptTokenCount: 0,
      thoughtsTokenCount: 0,
      apiTimeMs: 0,
    };

    const { lastFrame } = render(
      <SessionSummaryDisplay stats={zeroStats} duration="0s" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
