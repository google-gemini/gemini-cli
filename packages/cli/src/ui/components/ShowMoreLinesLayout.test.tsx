/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Box, Text } from 'ink';
import { render } from '../../test-utils/render.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { useOverflowState } from '../contexts/OverflowContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';

import type React from 'react';

vi.mock('../contexts/OverflowContext.js', () => ({
  useOverflowState: vi.fn().mockReturnValue({ overflowingIds: new Set(['1']) }),
  OverflowProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(),
}));

describe('ShowMoreLines layout and padding', () => {
  const mockUseOverflowState = vi.mocked(useOverflowState);
  const mockUseAlternateBuffer = vi.mocked(useAlternateBuffer);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAlternateBuffer.mockReturnValue(true);
    mockUseOverflowState.mockReturnValue({
      overflowingIds: new Set(['1']),
    } as NonNullable<ReturnType<typeof useOverflowState>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with single padding (paddingX=1, marginBottom=1)', async () => {
    const TestComponent = () => (
      <Box flexDirection="column">
        <Text>Top</Text>
        <ShowMoreLines constrainHeight={true} isOverflowing={true} />
        <Text>Bottom</Text>
      </Box>
    );

    const { lastFrame, unmount } = await render(<TestComponent />);

    // lastFrame() strips some formatting but keeps layout
    const output = lastFrame({ allowEmpty: true });

    // With paddingX=1, there should be a space before the text
    // With marginBottom=1, there should be an empty line between the text and "Bottom"
    // Since "Top" is just above it without margin, it should be on the previous line
    const lines = output.split('\n');

    expect(lines).toEqual([
      'Top',
      ' Press Ctrl+O to show more lines',
      '',
      'Bottom',
      '',
    ]);

    unmount();
  });

  it('renders in Standard mode as well', async () => {
    mockUseAlternateBuffer.mockReturnValue(false); // Standard mode

    const TestComponent = () => (
      <Box flexDirection="column">
        <Text>Top</Text>
        <ShowMoreLines constrainHeight={true} isOverflowing={true} />
        <Text>Bottom</Text>
      </Box>
    );

    const { lastFrame, unmount } = await render(<TestComponent />);

    const output = lastFrame({ allowEmpty: true });
    const lines = output.split('\n');

    expect(lines).toEqual([
      'Top',
      ' Press Ctrl+O to show more lines',
      '',
      'Bottom',
      '',
    ]);

    unmount();
  });
});
