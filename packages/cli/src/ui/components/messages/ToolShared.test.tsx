/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { Text } from 'ink';
import { McpProgressIndicator } from './ToolShared.js';

vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: () => <Text>MockSpinner</Text>,
}));

describe('McpProgressIndicator', () => {
  it('renders determinate progress at 50%', async () => {
    const { lastFrame, waitUntilReady } = render(
      <McpProgressIndicator progress={50} total={100} barWidth={20} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('50%');
  });

  it('renders complete progress at 100%', async () => {
    const { lastFrame, waitUntilReady } = render(
      <McpProgressIndicator progress={100} total={100} barWidth={20} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('100%');
  });

  it('renders indeterminate progress with raw count', async () => {
    const { lastFrame, waitUntilReady } = render(
      <McpProgressIndicator progress={7} barWidth={20} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('7');
    expect(output).not.toContain('%');
  });

  it('renders progress with a message', async () => {
    const { lastFrame, waitUntilReady } = render(
      <McpProgressIndicator
        progress={30}
        total={100}
        message="Downloading..."
        barWidth={20}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('Downloading...');
  });

  it('clamps progress exceeding total to 100%', async () => {
    const { lastFrame, waitUntilReady } = render(
      <McpProgressIndicator progress={150} total={100} barWidth={20} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('100%');
    expect(output).not.toContain('150%');
  });
});
