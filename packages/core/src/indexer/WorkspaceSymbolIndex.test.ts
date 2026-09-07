/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { WorkspaceSymbolIndex } from './WorkspaceSymbolIndex.js';

describe('WorkspaceSymbolIndex', () => {
  it('indexes files in memory and queries by exact and prefix match', () => {
    const index = new WorkspaceSymbolIndex('/mock/root');
    index.indexFile('src/engine.ts', 'export class SessionEngine {}\nexport function startSession() {}');
    index.indexFile('src/provider.ts', 'export class OllamaProvider {}\nexport class PlaceholderProvider {}');

    // Exact search
    const exact = index.find('SessionEngine');
    expect(exact.length).toBe(1);
    expect(exact[0].name).toBe('SessionEngine');
    expect(exact[0].file).toBe('src/engine.ts');

    // Substring / partial search
    const providers = index.find('provider');
    expect(providers.length).toBe(2);

    // Filter by kind
    const classes = index.find('', 'class');
    expect(classes.length).toBe(3);
  });

  it('formats clean table of symbols', () => {
    const index = new WorkspaceSymbolIndex('/mock/root');
    index.indexFile('src/tools.ts', 'export class ReadFileTool {}');

    const matches = index.find('ReadFileTool');
    const table = index.formatTable(matches);

    expect(table).toContain('Found 1 symbol');
    expect(table).toContain('CLASS');
    expect(table).toContain('ReadFileTool');
    expect(table).toContain('src/tools.ts:1');
  });

  it('returns empty notice when no symbols match', () => {
    const index = new WorkspaceSymbolIndex('/mock/root');
    const table = index.formatTable([]);
    expect(table).toContain('No matching symbols found.');
  });
});
