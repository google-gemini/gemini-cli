/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export { LspManager, type LspServerStatus } from './manager.js';
export { LspServerRegistry } from './server-registry.js';
export {
  collectDiagnosticsForOutput,
  formatDiagnostics,
  appendLspDiagnostics,
  buildDiagnosticSummary,
  enrichToolResultWithLsp,
  formatSymbolSummary,
  enrichReadWithLsp,
} from './enrichment.js';
export type {
  LspSettings,
  LspServerUserConfig,
  LspServerDefinition,
  Diagnostic,
  DocumentSymbol,
  SymbolInformation,
  Hover,
  Location,
  Position,
  Range,
} from './types.js';
export { DiagnosticSeverity, DEFAULT_LSP_SETTINGS } from './types.js';
