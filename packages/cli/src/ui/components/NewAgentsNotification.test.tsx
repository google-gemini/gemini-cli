/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders as render } from '../../test-utils/render.js';
import { NewAgentsNotification } from './NewAgentsNotification.js';

describe('NewAgentsNotification', () => {
  const mockAgents = [
    {
      name: 'Agent A',
      description: 'Description A',
      kind: 'remote' as const,
      agentCardUrl: '',
      inputConfig: { inputSchema: {} },
    },
    {
      name: 'Agent B',
      description: 'Description B',
      kind: 'remote' as const,
      agentCardUrl: '',
      inputConfig: { inputSchema: {} },
    },
  ];
  const onSelect = vi.fn();

  it('renders agent list', () => {
    const { lastFrame, unmount } = render(
      <NewAgentsNotification agents={mockAgents} onSelect={onSelect} />,
    );

    const frame = lastFrame();
    expect(frame).toMatchSnapshot();
    unmount();
  });

  it('truncates list if more than 5 agents', () => {
    const manyAgents = Array.from({ length: 7 }, (_, i) => ({
      name: `Agent ${i}`,
      description: `Description ${i}`,
      kind: 'remote' as const,
      agentCardUrl: '',
      inputConfig: { inputSchema: {} },
    }));

    const { lastFrame, unmount } = render(
      <NewAgentsNotification agents={manyAgents} onSelect={onSelect} />,
    );

    const frame = lastFrame();
    expect(frame).toMatchSnapshot();
    unmount();
  });
});
