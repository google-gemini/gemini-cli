/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, expect, it } from 'vitest';
import { TokenUsageDisplay } from './TokenUsageDisplay.js';

describe('TokenUsageDisplay', () => {
  it('renders without crashing', () => {
    const { lastFrame } = render(<TokenUsageDisplay />);
    expect(lastFrame()).toContain('↑');
    expect(lastFrame()).toContain('↓');
  });

  // TODO: Add more test after implementing real token tracking
});
