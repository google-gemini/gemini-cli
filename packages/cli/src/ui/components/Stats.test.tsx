/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import {
  StatRow,
  StatsColumn,
  DurationColumn,
  FormattedStats,
} from './Stats.js';
import { Colors } from '../colors.js';

describe('<StatRow />', () => {
  it('renders a label and value', () => {
    const { lastFrame } = render(
      <StatRow label="Test Label" value="Test Value" />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with a specific value color', () => {
    const { lastFrame } = render(
      <StatRow
        label="Test Label"
        value="Test Value"
        valueColor={Colors.AccentGreen}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe('<StatsColumn />', () => {
  const mockStats: FormattedStats = {
    inputTokens: 100,
    outputTokens: 200,
    toolUseTokens: 50,
    thoughtsTokens: 25,
    cachedTokens: 10,
    totalTokens: 385,
  };

  it('renders a stats column with children', () => {
    const { lastFrame } = render(
      <StatsColumn title="Test Stats" stats={mockStats}>
        <StatRow label="Child Prop" value="Child Value" />
      </StatsColumn>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a stats column with a specific width', () => {
    const { lastFrame } = render(
      <StatsColumn title="Test Stats" stats={mockStats} width="50%" />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a cumulative stats column with percentages', () => {
    const { lastFrame } = render(
      <StatsColumn title="Cumulative Stats" stats={mockStats} isCumulative />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('hides the tool use row when there are no tool use tokens', () => {
    const statsWithNoToolUse: FormattedStats = {
      ...mockStats,
      toolUseTokens: 0,
    };
    const { lastFrame } = render(
      <StatsColumn title="Test Stats" stats={statsWithNoToolUse} />,
    );
    expect(lastFrame()).not.toContain('Tool Use Tokens');
  });
});

describe('<DurationColumn />', () => {
  it('renders a duration column', () => {
    const { lastFrame } = render(
      <DurationColumn apiTime="5s" wallTime="10s" />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
