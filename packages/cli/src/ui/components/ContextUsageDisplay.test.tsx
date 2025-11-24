/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@google/gemini-cli-core', () => ({
  tokenLimit: () => 10000,
}));

vi.mock('../../config/settings.js', () => ({
  DEFAULT_MODEL_CONFIGS: {},
  LoadedSettings: class {
    constructor() {
      // this.merged = {};
    }
  },
}));

describe('ContextUsageDisplay', () => {
  it('renders correct percentage left', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay
        promptTokenCount={5000}
        model="gemini-pro"
        terminalWidth={120}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('50% context left');
  });

  it('renders short label when terminal width is small', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay
        promptTokenCount={2000}
        model="gemini-pro"
        terminalWidth={80}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('80%');
    expect(output).not.toContain('context left');
  });

  it('renders 0% when full', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay
        promptTokenCount={10000}
        model="gemini-pro"
        terminalWidth={120}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('0% context left');
  });
});
