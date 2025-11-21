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
import { StreamingState } from '../types.js';

vi.mock('../contexts/OverflowContext.js');
vi.mock('../contexts/StreamingContext.js');

describe('ShowMoreLines', () => {
  const mockUseOverflowState = vi.mocked(useOverflowState);
  const mockUseStreamingContext = vi.mocked(useStreamingContext);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [new Set(), StreamingState.Idle, true], // No overflow
    [new Set(['1']), StreamingState.Idle, false], // Not constraining height
    [new Set(['1']), StreamingState.Responding, true], // Streaming
  ])(
    'renders nothing when: overflow=%s, streaming=%s, constrain=%s',
    (overflowingIds, streamingState, constrainHeight) => {
      mockUseOverflowState.mockReturnValue({ overflowingIds } as NonNullable<
        ReturnType<typeof useOverflowState>
      >);
      mockUseStreamingContext.mockReturnValue(streamingState);
      const { lastFrame } = render(
        <ShowMoreLines constrainHeight={constrainHeight} />,
      );
      expect(lastFrame()).toBe('');
    },
  );

  it.each([[StreamingState.Idle], [StreamingState.WaitingForConfirmation]])(
    'renders message when overflowing and state is %s',
    (streamingState) => {
      mockUseOverflowState.mockReturnValue({
        overflowingIds: new Set(['1']),
      } as NonNullable<ReturnType<typeof useOverflowState>>);
      mockUseStreamingContext.mockReturnValue(streamingState);
      const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
      expect(lastFrame()).toContain('Press ctrl-s to show more lines');
    },
  );
});
