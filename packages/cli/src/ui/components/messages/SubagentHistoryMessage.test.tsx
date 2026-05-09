/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { SubagentHistoryMessage } from './SubagentHistoryMessage.js';
import type { HistoryItemSubagent } from '../../types.js';

describe('SubagentHistoryMessage', () => {
  const mockItem: HistoryItemSubagent = {
    type: 'subagent',
    agentName: 'research',
    history: [
      {
        id: '1',
        type: 'thought',
        content: 'Thinking about the problem',
        status: 'completed',
      },
      {
        id: '2',
        type: 'tool_call',
        content: 'Calling search_web',
        status: 'running',
      },
      {
        id: '3',
        type: 'tool_call',
        content: 'Calling read_file fail',
        status: 'error',
      },
    ],
  };

  it('renders header with agent name and item count', async () => {
    const renderResult = await renderWithProviders(
      <SubagentHistoryMessage item={mockItem} terminalWidth={80} />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('research Trace (3 items)');
    expect(output).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('renders thought activities with brain icon', async () => {
    const renderResult = await renderWithProviders(
      <SubagentHistoryMessage item={mockItem} terminalWidth={80} />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('🧠 Thinking about the problem');
    renderResult.unmount();
  });

  it('renders tool call activities with tool icon', async () => {
    const renderResult = await renderWithProviders(
      <SubagentHistoryMessage item={mockItem} terminalWidth={80} />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('🛠️ Calling search_web');
    renderResult.unmount();
  });

  it('renders status indicators correctly', async () => {
    const renderResult = await renderWithProviders(
      <SubagentHistoryMessage item={mockItem} terminalWidth={80} />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('Calling search_web (Running...)');
    expect(output).toContain('Thinking about the problem ✅');
    expect(output).toContain('Calling read_file fail ❌');
    renderResult.unmount();
  });
});
