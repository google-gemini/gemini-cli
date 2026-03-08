/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { collectNewMermaidSpecs } from './mermaidBlocks.js';

describe('collectNewMermaidSpecs', () => {
  it('extracts fenced mermaid and strips line numbers', () => {
    const text = `
Explanation text.

\`\`\`mermaid
1 graph TD
2 A --> B
\`\`\`
`;

    const specs = collectNewMermaidSpecs(text, new Set<string>());
    expect(specs).toEqual(['graph TD\nA --> B']);
  });

  it('extracts indented numbered mermaid when fences are missing', () => {
    const text = `
Explanation text.

  1 sequenceDiagram
  2 participant A as Client
  3 participant B as Server
  4 A->>B: request
  5 B-->>A: response

Next section starts here.
`;

    const specs = collectNewMermaidSpecs(text, new Set<string>());
    expect(specs).toEqual([
      'sequenceDiagram\nparticipant A as Client\nparticipant B as Server\nA->>B: request\nB-->>A: response',
    ]);
  });
});
