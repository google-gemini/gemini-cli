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
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('uses description when subject is empty', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: '', description: 'Processing details' }}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders full mode with left border and full text', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Planning',
          description: 'I am planning the solution.',
        }}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('indents summary line correctly', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Summary line',
          description: 'First body line',
        }}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('normalizes escaped newline tokens', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Matching the Blocks',
          description: '\\n\\nSome more text',
        }}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders empty state gracefully', () => {
    const { lastFrame } = renderWithProviders(
      <ThinkingMessage thought={{ subject: '', description: '' }} />,
    );

    expect(lastFrame()).toBe('');
  });
});
