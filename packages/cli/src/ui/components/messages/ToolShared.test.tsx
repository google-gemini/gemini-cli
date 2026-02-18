/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { MCPProgressIndicator } from './ToolShared.js';
import { describe, it, expect } from 'vitest';

describe('MCPProgressIndicator', () => {
  it('renders determinate progress bar at 50%', () => {
    const { lastFrame } = render(
      <MCPProgressIndicator progress={50} total={100} barWidth={20} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders fully complete progress bar', () => {
    const { lastFrame } = render(
      <MCPProgressIndicator progress={100} total={100} barWidth={20} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders indeterminate progress without total', () => {
    const { lastFrame } = render(
      <MCPProgressIndicator progress={5} barWidth={20} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders progress message when provided', () => {
    const { lastFrame } = render(
      <MCPProgressIndicator
        progress={50}
        total={100}
        message="Downloading..."
        barWidth={20}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('scales bar width correctly', () => {
    const { lastFrame } = render(
      <MCPProgressIndicator progress={50} total={100} barWidth={40} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('clamps progress exceeding total', () => {
    const { lastFrame } = render(
      <MCPProgressIndicator progress={150} total={100} barWidth={20} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
