/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { Text } from 'ink';
import { McpProgressIndicator, ToolInfo } from './ToolShared.js';
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
  const longDescription = 'long '.repeat(50);

  it('truncates description by default', async () => {
    const { lastFrame } = await render(
      <ToolInfo
        name="test-tool"
        description={longDescription}
        status={CoreToolCallStatus.Success}
        emphasis="medium"
      />,
    );
    const output = lastFrame();
    // In Ink, a single line Box with wrap="truncate" will be truncated.
    // Since we don't know the exact terminal width in this test, we check if it is short.
    expect(output.trim().split('\n').length).toBe(1);
  });

  it('wraps description when isExpanded is true', async () => {
    const { lastFrame } = await render(
      <ToolInfo
        name="test-tool"
        description={longDescription}
        status={CoreToolCallStatus.Success}
        emphasis="medium"
        isExpanded={true}
      />,
    );
    const output = lastFrame();
    // When expanded, it should wrap into multiple lines.
    expect(output.trim().split('\n').length).toBeGreaterThan(1);
  });
});
