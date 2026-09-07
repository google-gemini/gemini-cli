/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SymbolExtractor } from './SymbolExtractor.js';

describe('SymbolExtractor', () => {
  it('extracts TypeScript classes, interfaces, types, functions, and methods', () => {
    const tsCode = `
export class SessionEngine implements Engine {
  private id: string;

  public async start(): Promise<void> {
    console.log('started');
  }
}

export interface SessionConfig {
  root: string;
}

export type SessionState = 'idle' | 'running';

export function createEngine(config: SessionConfig): SessionEngine {
  return new SessionEngine();
}

export const helperFn = async (x: number): Promise<number> => x * 2;
`;

    const symbols = SymbolExtractor.extract(tsCode, 'src/engine.ts');
    expect(symbols.length).toBe(6);

    const classSym = symbols.find((s) => s.kind === 'class');
    expect(classSym?.name).toBe('SessionEngine');
    expect(classSym?.isExported).toBe(true);

    const ifaceSym = symbols.find((s) => s.kind === 'interface');
    expect(ifaceSym?.name).toBe('SessionConfig');

    const typeSym = symbols.find((s) => s.kind === 'type');
    expect(typeSym?.name).toBe('SessionState');

    const funcSym = symbols.find((s) => s.name === 'createEngine');
    expect(funcSym?.kind).toBe('function');

    const arrowSym = symbols.find((s) => s.name === 'helperFn');
    expect(arrowSym?.kind).toBe('function');

    const methodSym = symbols.find((s) => s.kind === 'method');
    expect(methodSym?.name).toBe('SessionEngine.start');
  });

  it('extracts Python classes and functions', () => {
    const pyCode = `
class AgentRunner(BaseRunner):
    def __init__(self):
        pass

def process_event(event: dict) -> bool:
    return True
`;
    const symbols = SymbolExtractor.extract(pyCode, 'agent.py');
    expect(symbols.length).toBe(3);

    const classSym = symbols.find((s) => s.kind === 'class');
    expect(classSym?.name).toBe('AgentRunner');

    const methodSym = symbols.find((s) => s.kind === 'method');
    expect(methodSym?.name).toBe('AgentRunner.__init__');

    const funcSym = symbols.find((s) => s.kind === 'function');
    expect(funcSym?.name).toBe('process_event');
  });

  it('extracts Go functions', () => {
    const goCode = `
func RunServer(ctx context.Context) error {
    return nil
}
`;
    const symbols = SymbolExtractor.extract(goCode, 'main.go');
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('RunServer');
    expect(symbols[0].isExported).toBe(true);
  });
});
