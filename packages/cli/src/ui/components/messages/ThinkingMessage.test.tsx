/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { ThinkingMessage } from './ThinkingMessage.js';

describe('ThinkingMessage', () => {
  it('renders subject line with vertical rule and "Thinking..." header', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: 'Planning', description: 'test' }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain(' Thinking...');
    expect(output).toContain('│');
    expect(output).toContain('Planning');
    unmount();
  });

  it('uses description when subject is empty', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: '', description: 'Processing details' }}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Processing details');
    expect(output).toContain('│');
    unmount();
  });

  it('renders full mode with left border and full text', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Planning',
          description: 'I am planning the solution.',
        }}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('│');
    expect(output).toContain('Planning');
    expect(output).toContain('I am planning the solution.');
    unmount();
  });

  it('renders "Thinking..." header when isFirstThinking is true', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Summary line',
          description: 'First body line',
        }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain(' Thinking...');
    expect(output).toContain('Summary line');
    expect(output).toContain('│');
    unmount();
  });

  it('normalizes escaped newline tokens', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Matching the Blocks',
          description: '\\n\\nSome more text',
        }}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders empty state gracefully', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: '', description: '' }}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });
});
