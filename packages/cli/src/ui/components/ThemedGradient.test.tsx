/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ThemedGradient } from './ThemedGradient.js';
import { describe, it, expect, vi } from 'vitest';

// Mock theme to control gradient
vi.mock('../semantic-colors.js', () => ({
  theme: {
    ui: {
      gradient: ['red', 'blue'],
    },
    text: {
      accent: 'cyan',
    },
  },
}));

describe('ThemedGradient', () => {
  it('renders children', () => {
    const { lastFrame } = render(<ThemedGradient>Hello</ThemedGradient>);
    expect(lastFrame()).toContain('Hello');
  });

  // Note: Testing actual gradient application is hard with ink-testing-library
  // as it often renders as plain text or ANSI codes.
  // We mainly ensure it doesn't crash and renders content.
});
