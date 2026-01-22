/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiMessage } from './GeminiMessage.js';
import { StreamingState } from '../../types.js';
import { renderWithProviders } from '../../../test-utils/render.js';

describe('<GeminiMessage /> - Raw Markdown Display Snapshots', () => {
  const baseProps = {
    text: 'Test **bold** and `code` markdown\n\n```javascript\nconst x = 1;\n```',
    isPending: false,
    terminalWidth: 80,
  };

  it.each([
    { renderMarkdown: true, description: '(default)' },
    {
      renderMarkdown: false,
      description: '(raw markdown with syntax highlighting, no line numbers)',
    },
  ])(
    'renders with renderMarkdown=$renderMarkdown $description',
    ({ renderMarkdown }) => {
      const { lastFrame } = renderWithProviders(
        <GeminiMessage {...baseProps} />,
        {
          uiState: { renderMarkdown, streamingState: StreamingState.Idle },
        },
      );
      expect(lastFrame()).toMatchSnapshot();
    },
  );

  it.each([{ renderMarkdown: true }, { renderMarkdown: false }])(
    'renders pending state with renderMarkdown=$renderMarkdown',
    ({ renderMarkdown }) => {
      const { lastFrame } = renderWithProviders(
        <GeminiMessage {...baseProps} isPending={true} />,
        {
          uiState: { renderMarkdown, streamingState: StreamingState.Idle },
        },
      );
      expect(lastFrame()).toMatchSnapshot();
    },
  );
});

describe('<GeminiMessage /> - Response Time Display', () => {
  const baseProps = {
    text: 'Hello, world!',
    isPending: false,
    terminalWidth: 80,
  };

  it('displays response time when provided and not pending', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} responseTime={5} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).toContain('(5s)');
  });

  it('displays response time in minutes and seconds format', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} responseTime={75} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).toContain('(1m 15s)');
  });

  it('displays response time in minutes only when seconds are zero', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} responseTime={120} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).toContain('(2m)');
  });

  it('does not display response time when pending', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} isPending={true} responseTime={5} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).not.toContain('(5s)');
  });

  it('does not display response time when not provided', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    // Should not have any time indicator pattern
    expect(lastFrame()).not.toMatch(/\(\d+s\)/);
    expect(lastFrame()).not.toMatch(/\(\d+m\)/);
  });

  it('does not display response time when zero', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} responseTime={0} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).not.toMatch(/\(\d+s\)/);
  });
});
