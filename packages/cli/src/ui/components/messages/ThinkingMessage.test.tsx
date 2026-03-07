/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { ThinkingMessage } from './ThinkingMessage.js';
import React from 'react';

describe('ThinkingMessage', () => {
  it('renders subject line with vertical rule and "Thinking..." header', async () => {
    const renderResult = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: 'Planning', description: 'test' }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain(' Thinking...');
    expect(output).toContain('│');
    expect(output).toContain('Planning');
    expect(output).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('uses description when subject is empty', async () => {
    const renderResult = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: '', description: 'Processing details' }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('Processing details');
    expect(output).toContain('│');
    expect(output).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('renders full mode with left border and full text', async () => {
    const renderResult = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Planning',
          description: 'I am planning the solution.',
        }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('│');
    expect(output).toContain('Planning');
    expect(output).toContain('I am planning the solution.');
    expect(output).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('renders "Thinking..." header when isFirstThinking is true', async () => {
    const renderResult = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Summary line',
          description: 'First body line',
        }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain(' Thinking...');
    expect(output).toContain('Summary line');
    expect(output).toContain('│');
    expect(output).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('normalizes escaped newline tokens', async () => {
    const renderResult = renderWithProviders(
      <ThinkingMessage
        thought={{
          subject: 'Matching the Blocks',
          description: '\\n\\nSome more text',
        }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await renderResult.waitUntilReady();

    expect(renderResult.lastFrame()).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('renders empty state gracefully', async () => {
    const renderResult = renderWithProviders(
      <ThinkingMessage
        thought={{ subject: '', description: '' }}
        terminalWidth={80}
        isFirstThinking={true}
      />,
    );
    await renderResult.waitUntilReady();

    expect(renderResult.lastFrame({ allowEmpty: true })).toBe('');
    renderResult.unmount();
  });

  it('renders multiple thinking messages sequentially correctly', async () => {
    const renderResult = renderWithProviders(
      <React.Fragment>
        <ThinkingMessage
          thought={{
            subject: 'Initial analysis',
            description:
              'This is a multiple line paragraph for the first thinking message of how the model analyzes the problem.',
          }}
          terminalWidth={80}
          isFirstThinking={true}
        />
        <ThinkingMessage
          thought={{
            subject: 'Planning execution',
            description:
              'This a second multiple line paragraph for the second thinking message explaining the plan in detail so that it wraps around the terminal display.',
          }}
          terminalWidth={80}
        />
        <ThinkingMessage
          thought={{
            subject: 'Refining approach',
            description:
              'And finally a third multiple line paragraph for the third thinking message to refine the solution.',
          }}
          terminalWidth={80}
        />
      </React.Fragment>,
    );
    await renderResult.waitUntilReady();

    expect(renderResult.lastFrame()).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });
});
