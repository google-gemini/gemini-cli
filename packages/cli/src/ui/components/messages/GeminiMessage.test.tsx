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

  it('renders with renderMarkdown=true (default)', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with renderMarkdown=false (raw markdown with syntax highlighting, no line numbers)', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} />,
      {
        uiState: { renderMarkdown: false, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders pending state with renderMarkdown=true', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} isPending={true} />,
      {
        uiState: { renderMarkdown: true, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders pending state with renderMarkdown=false', () => {
    const { lastFrame } = renderWithProviders(
      <GeminiMessage {...baseProps} isPending={true} />,
      {
        uiState: { renderMarkdown: false, streamingState: StreamingState.Idle },
      },
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
