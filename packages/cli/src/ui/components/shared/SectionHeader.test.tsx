/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { SectionHeader } from './SectionHeader.js';
import { describe, it, expect } from 'vitest';

describe('<SectionHeader />', () => {
  it('renders correctly with a standard title', () => {
    const { lastFrame, unmount } = renderWithProviders(
      <SectionHeader title="My Header" />,
      { width: 40 },
    );

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly when title is truncated but still shows dashes', () => {
    // Width 20, title "Very Long Header Title That Will Truncate"
    // Prefix "── " is 3 chars. "Very Lon..."
    // Line box minWidth 2 + marginLeft 1 = 3 chars.
    const { lastFrame, unmount } = renderWithProviders(
      <SectionHeader title="Very Long Header Title That Will Truncate" />,
      { width: 20 },
    );

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly in a narrow container', () => {
    const { lastFrame, unmount } = renderWithProviders(
      <SectionHeader title="Narrow Container" />,
      { width: 25 },
    );

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
