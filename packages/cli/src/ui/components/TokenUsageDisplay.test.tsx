/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, expect, it, vi } from 'vitest';
import { TokenUsageDisplay } from './TokenUsageDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

describe('TokenUsageDisplay', () => {
  it('renders without crashing', () => {
    useSessionStatsMock.mockReturnValue({
      stats: {
        metrics: {
          models: {},
        },
      },
    } as never);

    const { lastFrame } = render(<TokenUsageDisplay />);
    expect(lastFrame()).toContain('↑');
    expect(lastFrame()).toContain('↓');
  });

  it('displays aggregated token counts from session stats', () => {
    useSessionStatsMock.mockReturnValue({
      stats: {
        metrics: {
          models: {
            'model-1': {
              tokens: { prompt: 100, candidates: 50 },
            },
            'model-2': {
              tokens: { prompt: 200, candidates: 150 },
            },
          },
        },
      },
    } as never);

    const { lastFrame } = render(<TokenUsageDisplay />);
    const output = lastFrame();
    expect(output).toContain('↑');
    expect(output).toContain('300');
    expect(output).toContain('↓');
    expect(output).toContain('200');
  });
});
