/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { ShortcutsHelp } from './ShortcutsHelp.js';

describe('ShortcutsHelp', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    vi.restoreAllMocks();
  });

  const testCases = [
    { name: 'wide', width: 100 },
    { name: 'narrow', width: 40 },
  ];

  const platforms = [
    { name: 'mac', value: 'darwin' },
    { name: 'linux', value: 'linux' },
  ] as const;

  it.each(
    platforms.flatMap((platform) =>
      testCases.map((testCase) => ({ ...testCase, platform })),
    ),
  )(
    'renders correctly in $name mode on $platform.name',
    async ({ width, platform }) => {
      Object.defineProperty(process, 'platform', {
        value: platform.value,
      });

      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <ShortcutsHelp />,
        {
          width,
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('shell mode');
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    },
  );

  it('always shows Tab Tab focus UI shortcut', async () => {
    const rendered = renderWithProviders(<ShortcutsHelp />);
    await rendered.waitUntilReady();
    expect(rendered.lastFrame()).toContain('Tab Tab');
    rendered.unmount();
  });
});
