/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Tool, ToolContext } from '../Tool.js';
import type { Capability } from '../../permissions/Capability.js';
import type { WorkspaceSymbolIndex } from '../../indexer/WorkspaceSymbolIndex.js';
import type { SymbolKind } from '../../indexer/SymbolModel.js';

export class InspectSymbolTool implements Tool {
  public readonly name = 'inspect_symbol';
  public readonly description =
    'Inspect and locate code symbols (classes, interfaces, functions, methods, types) across the workspace index.';
  public readonly capability: Capability = 'filesystem.read';

  public readonly parameters = {
    name: {
      type: 'string' as const,
      description: 'The symbol name to locate (e.g. SessionEngine, buildSystemPrompt, or method name).',
      required: true,
    },
    kind: {
      type: 'string' as const,
      description: 'Optional filter by symbol kind: class, interface, type, function, method.',
      required: false,
    },
  };

  private index: WorkspaceSymbolIndex;

  constructor(index: WorkspaceSymbolIndex) {
    this.index = index;
  }

  public async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const name = String(args['name'] || '').trim();
    if (!name) {
      return 'Error: name parameter is required.';
    }

    const kind = args['kind'] ? (String(args['kind']).toLowerCase() as SymbolKind) : undefined;
    const matches = this.index.find(name, kind);

    if (matches.length === 0) {
      return `No symbols found matching '${name}'${kind ? ` of kind '${kind}'` : ''}.`;
    }

    return JSON.stringify(
      matches.map((m) => ({
        name: m.name,
        kind: m.kind,
        location: `${m.file}:${m.line}`,
        signature: m.signature,
        exported: m.isExported,
      })),
      null,
      2
    );
  }
}
