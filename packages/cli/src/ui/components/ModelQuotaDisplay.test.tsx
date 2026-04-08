/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { ModelQuotaDisplay } from './ModelQuotaDisplay.js';

describe('<ModelQuotaDisplay />', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders quota information when buckets are provided', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const resetTime = new Date(now.getTime() + 1000 * 60 * 90).toISOString(); // 1 hour 30 minutes from now

    const buckets = [
      {
        modelId: 'gemini-2.5-pro',
        remainingFraction: 0.75,
        resetTime,
      },
    ];

    const { lastFrame } = await renderWithProviders(
      <ModelQuotaDisplay buckets={buckets} availableWidth={100} />,
      { width: 100 },
    );
    const output = lastFrame();

    expect(output).toContain('Model usage');
    expect(output).toContain('Pro');
    expect(output).toContain('25%');
    expect(output).toContain('Resets:');
    expect(output).toMatchSnapshot();

    vi.useRealTimers();
  });

  it('renders nothing when no buckets are provided', async () => {
    const { lastFrame } = await renderWithProviders(
      <ModelQuotaDisplay buckets={[]} availableWidth={100} />,
      { width: 100 },
    );
    const output = lastFrame({ allowEmpty: true });
    expect(output).toBe('');
  });

  it('filters models based on modelsToShow prop', async () => {
    const buckets = [
      {
        modelId: 'gemini-2.5-pro',
        remainingFraction: 0.5,
        resetTime: new Date().toISOString(),
      },
      {
        modelId: 'gemini-2.5-flash',
        remainingFraction: 0.8,
        resetTime: new Date().toISOString(),
      },
    ];

    const { lastFrame } = await renderWithProviders(
      <ModelQuotaDisplay
        buckets={buckets}
        modelsToShow={['gemini-2.5-pro']}
        availableWidth={100}
      />,
      { width: 100 },
    );
    const output = lastFrame();

    expect(output).toContain('Pro');
    expect(output).not.toContain('Flash');
  });
});
