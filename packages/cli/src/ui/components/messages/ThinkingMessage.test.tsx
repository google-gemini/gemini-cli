/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { ThinkingMessage } from './ThinkingMessage.js';

describe('ThinkingMessage', () => {
  it('renders subject line with vertical rule and "Thinking..." header', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: 'Planning', description: 'test' }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );

    expect(lastFrame()).toContain(' Thinking...');
    expect(lastFrame()).toContain('│');
    expect(lastFrame()).toContain('Planning');
  });

  it('uses description when subject is empty', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: '', description: 'Processing details' }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Processing details');
    expect(lastFrame()).toContain('│');
  });

  it('renders full mode with left vertical rule and full text', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Planning',
          description: 'I am planning the solution.',
        }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('│');
    expect(lastFrame()).toContain('Planning');
    expect(lastFrame()).toContain('I am planning the solution.');
  });

  it('renders "Thinking..." header when isFirstThinking is true', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Summary line',
          description: 'First body line',
        }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );

    expect(lastFrame()).toContain(' Thinking...');
    expect(lastFrame()).toContain('Summary line');
    expect(lastFrame()).toContain('│');
  });

  it('normalizes escaped newline tokens so literal \\n\\n is not shown', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Matching the Blocks',
          description: '\\n\\n',
        }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Matching the Blocks');
    expect(lastFrame()).not.toContain('\\n\\n');
  });

  it('renders empty state gracefully', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: '', description: '' }}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).not.toContain('Planning');
  });
});
