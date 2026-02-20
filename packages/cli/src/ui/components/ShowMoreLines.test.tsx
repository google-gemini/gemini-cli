/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOverflowState } from '../contexts/OverflowContext.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { StreamingState } from '../types.js';

vi.mock('../contexts/OverflowContext.js');
vi.mock('../contexts/StreamingContext.js');
vi.mock('../hooks/useAlternateBuffer.js');

describe('ShowMoreLines', () => {
  const mockUseOverflowState = vi.mocked(useOverflowState);
  const mockUseStreamingContext = vi.mocked(useStreamingContext);
  const mockUseAlternateBuffer = vi.mocked(useAlternateBuffer);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAlternateBuffer.mockReturnValue(false);
  });

  it.each([
    [new Set(), StreamingState.Idle, true], // No overflow
    [new Set(['1']), StreamingState.Idle, false], // Not constraining height
    [new Set(['1']), StreamingState.Responding, true], // Streaming
  ])(
    'renders nothing when: overflow=%s, streaming=%s, constrain=%s',
    async (overflowingIds, streamingState, constrainHeight) => {
      mockUseOverflowState.mockReturnValue({ overflowingIds } as NonNullable<
        ReturnType<typeof useOverflowState>
      >);
      mockUseStreamingContext.mockReturnValue(streamingState);
      const { lastFrame, waitUntilReady, unmount } = render(
        <ShowMoreLines constrainHeight={constrainHeight} />,
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toBe('');
      unmount();
    },
  );

  it.each([[StreamingState.Idle], [StreamingState.WaitingForConfirmation]])(
    'renders message when overflowing and state is %s',
    async (streamingState) => {
      mockUseOverflowState.mockReturnValue({
        overflowingIds: new Set(['1']),
      } as NonNullable<ReturnType<typeof useOverflowState>>);
      mockUseStreamingContext.mockReturnValue(streamingState);
      const { lastFrame, waitUntilReady, unmount } = render(
        <ShowMoreLines constrainHeight={true} />,
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('Press ctrl-o to show more lines');
      unmount();
    },
  );
});
