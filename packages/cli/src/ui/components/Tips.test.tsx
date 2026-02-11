/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { Tips } from './Tips.js';
import { describe, it, expect } from 'vitest';
import type { Config } from '@google/gemini-cli-core';

describe('Tips', () => {
  it('renders correct tips', () => {
    const config = {} as unknown as Config;

    const { lastFrame } = render(<Tips config={config} />);
    const output = lastFrame();
    expect(output).toContain('1. /help for more information');
    expect(output).toContain(
      '2. Ask coding questions, edit code or run commands',
    );
    expect(output).toContain('3. Be specific for the best results');
  });
});
