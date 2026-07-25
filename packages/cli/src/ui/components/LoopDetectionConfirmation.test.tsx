/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { LoopDetectionConfirmation } from './LoopDetectionConfirmation.js';

describe('LoopDetectionConfirmation', () => {
  const onComplete = vi.fn();

  it('renders correctly', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <LoopDetectionConfirmation onComplete={onComplete} />,
      { width: 101 },
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('contains the expected options', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <LoopDetectionConfirmation onComplete={onComplete} />,
      { width: 100 },
    );
    const output = lastFrame();

    expect(output).toContain('A potential loop was detected');
    expect(output).toContain('Keep loop detection enabled (esc)');
    expect(output).toContain('Disable loop detection for this session');
    expect(output).toContain(
      'This can happen due to repetitive tool calls or other model behavior',
    );
    unmount();
  });
});
