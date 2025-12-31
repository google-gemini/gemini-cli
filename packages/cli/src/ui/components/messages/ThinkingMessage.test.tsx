/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ThinkingMessage } from './ThinkingMessage.js';

describe('ThinkingMessage', () => {
  it('renders thinking header with count', () => {
    const { lastFrame } = render(
      <ThinkingMessage
        thoughts={[
          { subject: 'Planning', description: 'test' },
          { subject: 'Analyzing', description: 'test' },
        ]}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Thinking');
    expect(lastFrame()).toContain('(2)');
  });

  it('renders with single thought', () => {
    const { lastFrame } = render(
      <ThinkingMessage
        thoughts={[{ subject: 'Processing', description: 'test' }]}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('(1)');
  });

  it('renders empty state gracefully', () => {
    const { lastFrame } = render(
      <ThinkingMessage thoughts={[]} terminalWidth={80} />,
    );

    expect(lastFrame()).toContain('(0)');
  });
});
