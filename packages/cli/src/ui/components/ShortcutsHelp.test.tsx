/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { ShortcutsHelp } from './ShortcutsHelp.js';

describe('ShortcutsHelp', () => {
  it('renders correctly in wide mode', async () => {
    const { lastFrame } = renderWithProviders(<ShortcutsHelp />, {
      width: 100,
    });
    // Wait for it to render
    await waitFor(() => expect(lastFrame()).toContain('shell mode'));
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly in narrow mode', async () => {
    const { lastFrame } = renderWithProviders(<ShortcutsHelp />, { width: 40 });
    // Wait for it to render
    await waitFor(() => expect(lastFrame()).toContain('shell mode'));
    expect(lastFrame()).toMatchSnapshot();
  });
});
