/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '../../test-utils/render.js';
import {
  NewAgentsNotification,
  NewAgentsChoice,
} from './NewAgentsNotification.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(() => null),
}));

const MockedRadioButtonSelect = vi.mocked(RadioButtonSelect);

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

  it('passes correct options to RadioButtonSelect', () => {
    const { unmount } = render(
      <NewAgentsNotification agents={mockAgents} onSelect={onSelect} />,
    );

    expect(MockedRadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            label: 'Acknowledge and Enable',
            value: NewAgentsChoice.ACKNOWLEDGE,
            key: 'acknowledge',
          },
          {
            label: 'Do not enable (Ask again next time)',
            value: NewAgentsChoice.IGNORE,
            key: 'ignore',
          },
        ],
        onSelect,
      }),
      undefined,
    );
    unmount();
  });
});
