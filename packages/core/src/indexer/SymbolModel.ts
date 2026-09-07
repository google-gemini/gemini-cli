/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type SymbolKind = 'class' | 'interface' | 'type' | 'function' | 'method' | 'variable';

export interface SymbolDefinition {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  signature: string;
  isExported: boolean;
  docstring?: string;
}
