/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { VisualizeTool } from './visualize.js';

describe('VisualizeTool', () => {
  const getSignal = () => new AbortController().signal;

  it('renders mermaid diagrams as display text', async () => {
    const messageBus = new MessageBus(null as unknown as PolicyEngine, false);
    const tool = new VisualizeTool(messageBus);

    const result = await tool.buildAndExecute(
      {
        mermaid: 'flowchart TD\nA[Input] --> B[Output]',
      },
      getSignal(),
    );

    expect(result.llmContent).toContain('Diagram (flowchart)');
    expect(result.returnDisplay).toBeTypeOf('string');
  });

  it('returns execution error details when mermaid source is invalid', async () => {
    const messageBus = new MessageBus(null as unknown as PolicyEngine, false);
    const tool = new VisualizeTool(messageBus);

    const result = await tool.buildAndExecute(
      {
        mermaid: '',
      },
      getSignal(),
    );

    expect(result.error?.message).toContain('cannot be empty');
    expect(result.llmContent).toContain('Failed to render diagram');
  });
});
