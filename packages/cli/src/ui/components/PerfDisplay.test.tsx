/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PerfDisplay } from './PerfDisplay.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('<PerfDisplay />', () => {
  it('renders memory, startup, and runtime stats', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <PerfDisplay
        memory={{
          rss: 100 * 1024 * 1024,
          heapUsed: 50 * 1024 * 1024,
          heapTotal: 100 * 1024 * 1024,
          heapUsedPercent: 50,
          external: 5 * 1024 * 1024,
        }}
        runtime={{
          apiTimeMs: 1200,
          apiTimePercent: 60,
          toolTimeMs: 800,
          toolTimePercent: 40,
          cacheEfficiency: 35,
        }}
        startupPhases={[
          {
            name: 'load_settings',
            duration_ms: 42,
            cpu_usage_user_usec: 100,
            cpu_usage_system_usec: 50,
            start_time_usec: 1000,
            end_time_usec: 43000,
          },
        ]}
      />,
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('Performance Stats');
    expect(lastFrame()).toContain('Heap Used');
    expect(lastFrame()).toContain('50.0 MB / 100.0 MB (50.0%)');
    expect(lastFrame()).toContain('load_settings');
    expect(lastFrame()).toContain('1.2s (60.0%)');
    unmount();
  });

  it('shows an empty-state message when startup timings are unavailable', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <PerfDisplay
        memory={{
          rss: 100 * 1024 * 1024,
          heapUsed: 50 * 1024 * 1024,
          heapTotal: 100 * 1024 * 1024,
          heapUsedPercent: 50,
          external: 5 * 1024 * 1024,
        }}
        runtime={{
          apiTimeMs: 0,
          apiTimePercent: 0,
          toolTimeMs: 0,
          toolTimePercent: 0,
          cacheEfficiency: 0,
        }}
        startupPhases={[]}
      />,
    );

    await waitUntilReady();
    expect(lastFrame()).toContain(
      'No startup phase timings are available for this session.',
    );
    unmount();
  });
});
