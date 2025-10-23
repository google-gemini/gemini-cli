/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolMessageProps } from './ToolMessage.js';
import { ToolMessage } from './ToolMessage.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { StreamingContext } from '../../contexts/StreamingContext.js';
import { renderWithProviders } from '../../../test-utils/render.js';

describe('<ToolMessage /> - Raw Markdown Display Snapshots', () => {
  const baseProps: ToolMessageProps = {
    callId: 'tool-123',
    name: 'test-tool',
    description: 'A tool for testing',
    resultDisplay: 'Test **bold** and `code` markdown',
    status: ToolCallStatus.Success,
    terminalWidth: 80,
    confirmationDetails: undefined,
    emphasis: 'medium',
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
        <StreamingContext.Provider value={StreamingState.Idle}>
          <ToolMessage {...baseProps} />
        </StreamingContext.Provider>,
        {
          uiState: { renderMarkdown, streamingState: StreamingState.Idle },
        },
      );
      expect(lastFrame()).toMatchSnapshot();
    },
  );
});
