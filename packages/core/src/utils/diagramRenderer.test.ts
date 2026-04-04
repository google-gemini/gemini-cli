/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectDiagramType,
  renderDiagram,
  getDiagramRendererCacheSizeForTesting,
  resetDiagramRendererCacheForTesting,
} from './diagramRenderer.js';

describe('diagramRenderer', () => {
  beforeEach(() => {
    resetDiagramRendererCacheForTesting();
  });

  it('detects flowchart diagrams', () => {
    const detected = detectDiagramType('flowchart TD\nA --> B');
    expect(detected).toBe('flowchart');
  });

  it('renders flowcharts with inline labels and edge labels', () => {
    const rendered = renderDiagram('flowchart TD\nA[Foo] -->|label| B[Bar]');

    // Non data-structure flowcharts render in generic flowchart mode.
    expect(rendered).toContain('Diagram (flowchart)');
    expect(rendered).toContain('Foo');
    expect(rendered).toContain('Bar');
    expect(rendered).toContain('label');
  });

  it('normalizes html line breaks in labels for readability', () => {
    const rendered = renderDiagram(
      'flowchart LR\nA["Client SYN<br/>Server 200 OK"] --> B[Done]',
    );

    expect(rendered).toContain('Client SYN / Server 200 OK');
    expect(rendered).not.toContain('<br/>');
  });

  it('falls back to boxed steps for long linear chains', () => {
    const rendered = renderDiagram(
      'flowchart LR\nA[VeryLongStepNameWithoutSpaces001] --> B[VeryLongStepNameWithoutSpaces002] --> C[VeryLongStepNameWithoutSpaces003] --> D[VeryLongStepNameWithoutSpaces004] --> E[VeryLongStepNameWithoutSpaces005]',
    );

    expect(rendered).toContain('Diagram (flowchart)');
    expect(rendered).toContain('Steps (boxed):');
  });

  it('parses implicit flowchart edge labels without treating them as node ids', () => {
    const rendered = renderDiagram(
      'flowchart LR\nA[Client] -- 1: SYN --> B[Server]\nB -- 2: SYN-ACK --> A\nA -- 3: ACK --> B',
    );

    expect(rendered).toContain('Diagram (flowchart)');
    expect(rendered).toContain('Client');
    expect(rendered).toContain('Server');
    expect(rendered).toContain('1: SYN');
    expect(rendered).toContain('2: SYN-ACK');
    expect(rendered).toContain('3: ACK');
    expect(rendered).not.toContain('A -- 3: ACK');
  });

  it('renders chained flowchart edges without merging tokens', () => {
    const rendered = renderDiagram(
      'flowchart LR\nS_Head[Head] --> S_N1[N1] --> S_N2[N2] --> S_Null[/NULL/]',
    );

    // 4-node linear chain renders as Linked List (ASCII art)
    expect(rendered).toContain('Linked List');
    expect(rendered).toContain('Head');
    expect(rendered).toContain('N1');
    expect(rendered).toContain('N2');
  });

  it('ignores flowchart direction lines in subgraphs', () => {
    const rendered = renderDiagram(
      'flowchart LR\nsubgraph cluster\n  direction LR\n  A --> B\nend',
    );

    // Simple 2-node diagram renders as Linked List
    expect(rendered).not.toContain('direction_LR');
    expect(rendered).toContain('A');
    expect(rendered).toContain('B');
  });

  it('renders binary trees using boxed centered layout', () => {
    const rendered = renderDiagram(
      'flowchart TD\n%% binary tree\nN50[50] --> N25[25]\nN50 --> N75[75]\nN25 --> N12[12]\nN25 --> N37[37]\nN75 --> N62[62]\nN75 --> N87[87]',
    );

    expect(rendered).toContain('Binary Search Tree');
    expect(rendered).toContain('┌');
    expect(rendered).toContain('└');
    expect(rendered).toContain('50');
    expect(rendered).toContain('25');
    expect(rendered).toContain('75');
    expect(rendered).toContain('12');
    expect(rendered).toContain('37');
    expect(rendered).toContain('62');
    expect(rendered).toContain('87');
  });

  it('renders handshake-like flows as grouped timeline sections', () => {
    const rendered = renderDiagram(
      'flowchart LR\nA[Client] -- 1: SYN --> B[Server]\nB -- 2: SYN-ACK --> A\nA -- 3: ACK --> B\nA -- 4: Client Hello --> B\nB -- 5: Server Hello, Certificate --> A\nA -- 6: Key Exchange, Finished --> B\nA -- 7: HTTP Request --> B\nB -- 8: HTTP Response --> A',
    );

    expect(rendered).toContain('Diagram (flowchart)');
    expect(rendered).toContain('Handshake Timeline:');
    expect(rendered).toContain('TCP:');
    expect(rendered).toContain('TLS:');
    expect(rendered).toContain('HTTP:');
    expect(rendered).toContain('HTTP Request');
    expect(rendered).toContain('Client → Server: 1: SYN');
    expect(rendered).toContain('Server → Client: 2: SYN-ACK');
  });

  it('does not auto-render handshake branching as binary tree without tree intent', () => {
    const rendered = renderDiagram(
      'flowchart LR\nClient[Client] --> Syn[SYN]\nClient --> Hello[Client Hello]\nSyn --> Ack[ACK]\nSyn --> ServerHello[TLS Server Hello]\nHello --> Key[Key Exchange]\nHello --> Finished[Finished]\nKey --> Http[HTTP Request]\nHttp --> Resp[HTTP Response]',
    );

    expect(rendered).toContain('Diagram (flowchart)');
    expect(rendered).not.toContain('Binary Search Tree');
    expect(rendered).toContain('Handshake Timeline:');
    expect(rendered).toContain('Client → Server: SYN');
    expect(rendered).toContain('Server → Client: TLS Server Hello');
    expect(rendered).not.toContain('Client → SYN');
  });

  it('renders stack diagrams vertically when stack intent is present', () => {
    const rendered = renderDiagram(
      'flowchart TB\nS30[30] --> S20[20] --> S10[10]',
    );

    expect(rendered).toContain('Stack (Top to Bottom)');
    expect(rendered).toContain('← top');
    expect(rendered).toContain('bottom');
  });

  it('renders queue diagrams horizontally when queue intent is present', () => {
    const rendered = renderDiagram(
      'flowchart LR\nqueue[Queue] --> Q10[10] --> Q20[20] --> Q30[30]',
    );

    expect(rendered).toContain('Queue (Front to Rear)');
    expect(rendered).toContain('→');
    expect(rendered).toContain('null');
  });

  it('renders sequence diagrams', () => {
    const rendered = renderDiagram(
      'sequenceDiagram\nparticipant Alice\nparticipant Bob\nAlice->>Bob: Ping',
    );

    expect(rendered).toContain('Diagram (sequence)');
    expect(rendered).toContain('Alice ->> Bob: Ping');
  });

  it('renders class diagrams', () => {
    const rendered = renderDiagram(
      'classDiagram\nclass Animal\nclass Dog\nAnimal <|-- Dog : extends',
    );

    expect(rendered).toContain('Diagram (class)');
    expect(rendered).toContain('Animal <|-- Dog : extends');
  });

  it('renders er diagrams', () => {
    const rendered = renderDiagram(
      'erDiagram\nUSER ||--o{ ORDER : places\nUSER {\nstring id\n}',
    );

    expect(rendered).toContain('Diagram (erd)');
    expect(rendered).toContain('USER ||--o{ ORDER : places');
  });

  it('uses a 64-entry LRU cache', () => {
    renderDiagram('flowchart TD\nA --> B');
    renderDiagram('flowchart TD\nA --> B');

    expect(getDiagramRendererCacheSizeForTesting()).toBe(1);
  });

  it('throws for unknown diagrams', () => {
    expect(() => renderDiagram('A --> B')).toThrowError(
      /Unable to detect Mermaid diagram type/,
    );
  });
});
