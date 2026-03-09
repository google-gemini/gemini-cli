/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  renderDiagram,
  detectTerminalCapabilities,
} from './diagramRenderer.js';

describe('renderDiagram', () => {
  describe('flowchart', () => {
    it('renders a simple TD flowchart', () => {
      const content = `graph TD
  A[Start] --> B[End]`;
      const result = renderDiagram('flowchart', content);
      expect(result).toContain('Start');
      expect(result).toContain('End');
    });

    it('renders a flowchart with a diamond decision node', () => {
      const content = `graph TD
  A[Start] --> B{Decision?}
  B --> C[Yes]
  B --> D[No]`;
      const result = renderDiagram('flowchart', content);
      expect(result).toContain('Start');
      expect(result).toContain('Decision?');
    });

    it('renders LR direction', () => {
      const content = `graph LR
  A[Input] --> B[Process] --> C[Output]`;
      const result = renderDiagram('flowchart', content);
      expect(result).toContain('Input');
      expect(result).toContain('Process');
      expect(result).toContain('Output');
    });

    it('falls back gracefully for empty content', () => {
      const result = renderDiagram('flowchart', '');
      // Should not throw; returns fallback box
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('renders labeled edge and includes the label in output', () => {
      const content = `graph LR
  A[Submit] -->|Approve| B[Done]`;
      const result = renderDiagram('flowchart', content);
      expect(result).toContain('Submit');
      expect(result).toContain('Done');
      expect(result).toContain('Approve');
    });

    it('renders a self-loop node without throwing', () => {
      const content = `graph TD
  A[Task] --> A`;
      const result = renderDiagram('flowchart', content);
      expect(typeof result).toBe('string');
      expect(result).toContain('Task');
    });
  });

  describe('sequence', () => {
    it('renders participants and messages', () => {
      const content = `sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Hello
  B-->>A: Hi`;
      const result = renderDiagram('sequence', content);
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
      expect(result).toContain('Hello');
      expect(result).toContain('Hi');
    });

    it('renders implicit participants from messages', () => {
      const content = `sequenceDiagram
  Client->>Server: GET /api
  Server-->>Client: 200 OK`;
      const result = renderDiagram('sequence', content);
      expect(result).toContain('Client');
      expect(result).toContain('Server');
    });

    it('renders a Note directive', () => {
      const content = `sequenceDiagram
  participant A
  A->>A: self
  Note over A: caution`;
      const result = renderDiagram('sequence', content);
      expect(result).toContain('Note');
    });

    it('renders a loop block', () => {
      const content = `sequenceDiagram
  participant A
  participant B
  loop Retry
    A->>B: ping
  end`;
      const result = renderDiagram('sequence', content);
      expect(result).toContain('loop');
    });
  });

  describe('class', () => {
    it('renders class names and members', () => {
      const content = `classDiagram
  class Animal {
    +String name
    +eat()
  }
  class Dog {
    +bark()
  }
  Animal <|-- Dog`;
      const result = renderDiagram('class', content);
      expect(result).toContain('Animal');
      expect(result).toContain('Dog');
      expect(result).toContain('+String name');
    });

    it('renders relationship annotations', () => {
      const content = `classDiagram
  class A
  class B
  A --> B : uses`;
      const result = renderDiagram('class', content);
      expect(result).toContain('Relationships');
    });

    it('renders a class with no members as an empty box', () => {
      const content = `classDiagram
  class Empty`;
      const result = renderDiagram('class', content);
      expect(result).toContain('Empty');
      // Should still produce a box structure
      expect(result).toContain('┌');
      expect(result).toContain('└');
    });
  });

  describe('erd', () => {
    it('renders entity names and attributes', () => {
      const content = `erDiagram
  CUSTOMER {
    int id PK
    string name
  }
  ORDER {
    int id PK
    int customer_id FK
  }
  CUSTOMER ||--o{ ORDER : places`;
      const result = renderDiagram('erd', content);
      expect(result).toContain('CUSTOMER');
      expect(result).toContain('ORDER');
      expect(result).toContain('places');
    });

    it('renders an entity with no attributes', () => {
      const content = `erDiagram
  PRODUCT {
  }`;
      const result = renderDiagram('erd', content);
      expect(result).toContain('PRODUCT');
      expect(result).toContain('╔');
    });

    it('renders two entities with a relation', () => {
      const content = `erDiagram
  USER ||--o{ POST : writes`;
      const result = renderDiagram('erd', content);
      expect(result).toContain('USER');
      expect(result).toContain('POST');
      expect(result).toContain('writes');
    });
  });

  describe('caching', () => {
    it('returns the same output for repeated identical calls', () => {
      const content = `graph TD\n  A[X] --> B[Y]`;
      const first = renderDiagram('flowchart', content);
      const second = renderDiagram('flowchart', content);
      expect(first).toBe(second);
    });

    it('evicts oldest entry when cache exceeds 64 and still returns correct results', () => {
      // Fill cache with 65 unique diagrams to trigger eviction of the first entry
      for (let i = 0; i < 65; i++) {
        const result = renderDiagram(
          'flowchart',
          `graph TD\n  N${i}[Node${i}]`,
        );
        expect(typeof result).toBe('string');
      }
      // After eviction the renderer should still work correctly
      const result = renderDiagram(
        'flowchart',
        `graph TD\n  NCheck[Checkpoint]`,
      );
      expect(result).toContain('Checkpoint');
    });
  });

  describe('fallback', () => {
    it('falls back when no nodes are found', () => {
      const result = renderDiagram('flowchart', 'this is not mermaid');
      expect(result).toContain('flowchart');
    });
  });
});

describe('detectTerminalCapabilities', () => {
  it('returns a capabilities object with required fields', () => {
    const caps = detectTerminalCapabilities();
    expect(typeof caps.supportsUnicode).toBe('boolean');
    expect(typeof caps.supportsColor).toBe('boolean');
    expect(typeof caps.columns).toBe('number');
    expect(['kitty', 'iterm2', 'sixel', 'ansi', 'ascii']).toContain(
      caps.protocol,
    );
  });
});
