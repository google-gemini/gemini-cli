/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, renderWithProviders } from '../../../test-utils/render.js';
import { Text } from 'ink';
import { McpProgressIndicator, ToolInfo } from './ToolShared.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: () => <Text>MockSpinner</Text>,
}));

describe('McpProgressIndicator', () => {
  it('renders determinate progress at 50%', async () => {
    const { lastFrame } = await render(
      <McpProgressIndicator progress={50} total={100} barWidth={20} />,
    );
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('50%');
  });

  it('renders complete progress at 100%', async () => {
    const { lastFrame } = await render(
      <McpProgressIndicator progress={100} total={100} barWidth={20} />,
    );
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('100%');
  });

  it('renders indeterminate progress with raw count', async () => {
    const { lastFrame } = await render(
      <McpProgressIndicator progress={7} barWidth={20} />,
    );
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('7');
    expect(output).not.toContain('%');
  });

  it('renders progress with a message', async () => {
    const { lastFrame } = await render(
      <McpProgressIndicator
        progress={30}
        total={100}
        message="Downloading..."
        barWidth={20}
      />,
    );
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('Downloading...');
  });

  it('clamps progress exceeding total to 100%', async () => {
    const { lastFrame } = await render(
      <McpProgressIndicator progress={150} total={100} barWidth={20} />,
    );
    const output = lastFrame();
    expect(output).toContain('100%');
    expect(output).not.toContain('150%');
  });
});

describe('ToolInfo', () => {
  const baseProps = {
    name: 'test-tool',
    description:
      'A very long description that might need to be truncated to fit on a single line for display purposes',
    status: CoreToolCallStatus.Success,
    emphasis: 'medium' as const,
  };

  it('renders correctly', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <ToolInfo {...baseProps} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });

  it('honors truncateToolDescriptions=false', async () => {
    const settings = createMockSettings({
      merged: {
        ui: {
          truncateToolDescriptions: false,
        },
      },
    });

    const { lastFrame, waitUntilReady } = renderWithProviders(
      <ToolInfo {...baseProps} />,
      { settings },
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });
});
