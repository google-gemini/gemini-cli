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
    isFirst: true,
    borderColor: 'green',
    borderDimColor: false,
  };

  it.each([
    {
      renderMarkdown: true,
      useAlternateBuffer: false,
      description: '(default, regular buffer)',
    },
    {
      renderMarkdown: true,
      useAlternateBuffer: true,
      description: '(default, alternate buffer)',
    },
    {
      renderMarkdown: false,
      useAlternateBuffer: false,
      description: '(raw markdown, regular buffer)',
    },
    {
      renderMarkdown: false,
      useAlternateBuffer: true,
      description: '(raw markdown, alternate buffer)',
    },
    // Test cases where height constraint affects rendering in regular buffer but not alternate
    {
      renderMarkdown: true,
      useAlternateBuffer: false,
      availableTerminalHeight: 10,
      description: '(constrained height, regular buffer -> forces raw)',
    },
    {
      renderMarkdown: true,
      useAlternateBuffer: true,
      availableTerminalHeight: 10,
      description: '(constrained height, alternate buffer -> keeps markdown)',
    },
  ])(
    'renders with renderMarkdown=$renderMarkdown, useAlternateBuffer=$useAlternateBuffer $description',
    ({ renderMarkdown, useAlternateBuffer, availableTerminalHeight }) => {
      const { lastFrame } = renderWithProviders(
        <StreamingContext.Provider value={StreamingState.Idle}>
          <ToolMessage
            {...baseProps}
            availableTerminalHeight={availableTerminalHeight}
          />
        </StreamingContext.Provider>,
        {
          uiState: { renderMarkdown, streamingState: StreamingState.Idle },
          useAlternateBuffer,
        },
      );
      expect(lastFrame()).toMatchSnapshot();
    },
  );
});
