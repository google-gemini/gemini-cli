/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { SectionHeader } from './SectionHeader.js';

describe('<SectionHeader />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      description: 'renders correctly with a standard title',
      title: 'My Header',
      width: 40,
    },
    {
      description:
        'renders correctly when title is truncated but still shows dashes',
      title: 'Very Long Header Title That Will Truncate',
      width: 20,
    },
    {
      description: 'renders correctly in a narrow container',
      title: 'Narrow Container',
      width: 25,
    },
  ])('$description', async ({ title, width }) => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <SectionHeader title={title} />,
      { width },
    );
    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
