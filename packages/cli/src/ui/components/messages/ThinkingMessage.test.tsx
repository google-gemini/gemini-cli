/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { ThinkingMessage } from './ThinkingMessage.js';

describe('ThinkingMessage', () => {
  it('renders subject line', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: 'Planning', description: 'test' }}
        terminalWidth={80}
      />,
    );

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
    expect(lastFrame()).not.toContain('┌');
    expect(lastFrame()).not.toContain('┐');
    expect(lastFrame()).not.toContain('└');
    expect(lastFrame()).not.toContain('┘');
    expect(lastFrame()).toContain('Planning');
    expect(lastFrame()).toContain('I am planning the solution.');
  });

  it('starts left rule below the bold summary line in full mode', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Summary line',
          description: 'First body line',
        }}
        terminalWidth={80}
      />,
    );

    const lines = (lastFrame() ?? '').split('\n');
    expect(lines[0] ?? '').toContain('Summary line');
    expect(lines[0] ?? '').not.toContain('│');
    expect(lines.slice(1).join('\n')).toContain('│');
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
