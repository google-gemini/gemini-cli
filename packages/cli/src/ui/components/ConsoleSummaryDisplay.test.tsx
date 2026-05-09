/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';
import { describe, it, expect } from 'vitest';

describe('ConsoleSummaryDisplay', () => {
  it('renders nothing when errorCount is 0', async () => {
    const { lastFrame, unmount } = await render(
      <ConsoleSummaryDisplay errorCount={0} />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it.each([
    [1, '1 error'],
    [5, '5 errors'],
  ])('renders correct message for %i errors', async (count, expectedText) => {
    const { lastFrame, unmount } = await render(
      <ConsoleSummaryDisplay errorCount={count} />,
    );
    const output = lastFrame();
    expect(output).toContain(expectedText);
    expect(output).toContain('✖');
    expect(output).toContain('(F12 for details)');
    unmount();
  });
});
