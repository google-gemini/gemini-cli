/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualizeTool } from './visualize.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

function makeMessageBus(): MessageBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    request: vi.fn(),
  } as unknown as MessageBus;
}

function makeConfig(): Config {
  return {
    getModel: vi.fn().mockReturnValue('gemini-2.0-flash'),
  } as unknown as Config;
}

describe('VisualizeTool', () => {
  let tool: VisualizeTool;
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = makeMessageBus();
    tool = new VisualizeTool(makeConfig(), messageBus);
  });

  it('has the correct name', () => {
    expect(tool.name).toBe('visualize');
    expect(VisualizeTool.Name).toBe('visualize');
  });

  it('executes and returns ASCII art for a flowchart', async () => {
    const invocation = tool.build({
      diagram_type: 'flowchart',
      content: 'graph TD\n  A[Start] --> B[End]',
      title: 'Simple Flow',
    });

    expect(invocation).toBeDefined();
    const result = await invocation.execute(new AbortController().signal);
    expect(result.returnDisplay).toContain('Start');
    expect(result.llmContent).toContain('flowchart');
  });

  it('executes and returns ASCII art for a sequence diagram', async () => {
    const invocation = tool.build({
      diagram_type: 'sequence',
      content: 'sequenceDiagram\n  A->>B: Hello\n  B-->>A: Hi',
    });

    const result = await invocation.execute(new AbortController().signal);
    expect(result.returnDisplay).toContain('A');
    expect(result.returnDisplay).toContain('B');
  });

  it('includes the title in the header when provided', async () => {
    const invocation = tool.build({
      diagram_type: 'flowchart',
      content: 'graph TD\n  X[Node]',
      title: 'My Diagram',
    });

    const result = await invocation.execute(new AbortController().signal);
    expect(result.returnDisplay).toContain('My Diagram');
    expect(result.llmContent).toContain('My Diagram');
  });

  it('returns a description reflecting the diagram type and title', () => {
    const invocation = tool.build({
      diagram_type: 'class',
      content: 'classDiagram\n  class Foo',
      title: 'Domain',
    });
    const desc = invocation.getDescription();
    expect(desc).toContain('class');
    expect(desc).toContain('Domain');
  });

  it('executes and returns ASCII art for a class diagram', async () => {
    const invocation = tool.build({
      diagram_type: 'class',
      content: 'classDiagram\n  class Vehicle {\n    +String make\n  }',
      title: 'Classes',
    });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.returnDisplay).toContain('Vehicle');
  });

  it('executes and returns ASCII art for an erd diagram', async () => {
    const invocation = tool.build({
      diagram_type: 'erd',
      content: 'erDiagram\n  INVOICE {\n    int id PK\n  }',
    });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.returnDisplay).toContain('INVOICE');
  });

  it('does not throw and returns a non-empty display for invalid/empty content', async () => {
    const invocation = tool.build({
      diagram_type: 'flowchart',
      content: '',
    });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.returnDisplay).toBeTruthy();
  });

  it('llmContent starts with "Diagram rendered successfully"', async () => {
    const invocation = tool.build({
      diagram_type: 'sequence',
      content: 'sequenceDiagram\n  A->>B: hi',
    });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.llmContent).toMatch(/^Diagram rendered successfully/);
  });
});
