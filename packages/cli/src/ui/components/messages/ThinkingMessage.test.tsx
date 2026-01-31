/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { ThinkingMessage } from './ThinkingMessage.js';

describe('ThinkingMessage', () => {
  it('renders thinking header', () => {
    const { lastFrame } = render(
      <ThinkingMessage
        thought={{ subject: 'Planning', description: 'test' }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Thinking');
  });

  it('renders with thought subject', () => {
    const { lastFrame } = render(
      <ThinkingMessage
        thought={{ subject: 'Processing', description: 'test' }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Processing');
  });

  it('renders thought content', () => {
    const { lastFrame } = render(
      <ThinkingMessage
        thought={{
          subject: 'Planning',
          description: 'I am planning the solution.',
        }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Planning');
    expect(lastFrame()).toContain('I am planning the solution.');
  });

  it('renders empty state gracefully', () => {
    const { lastFrame } = render(
      <ThinkingMessage
        thought={{ subject: '', description: '' }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Thinking');
  });
});
