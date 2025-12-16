/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Type definitions
 *
 * Re-exports from vscode-languageserver-types and custom types for LSP support.
 */

import type {
  Diagnostic as VSDiagnostic,
  Range as VSRange,
  Position as VSPosition,
  TextDocumentIdentifier as VSTextDocumentIdentifier,
  VersionedTextDocumentIdentifier as VSVersionedTextDocumentIdentifier,
  TextDocumentItem as VSTextDocumentItem,
} from 'vscode-languageserver-types';

// Re-export core LSP types from vscode-languageserver-types
export type {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticRelatedInformation,
  DiagnosticTag,
  Range,
  Position,
  Hover,
  MarkupContent,
  MarkupKind,
  MarkedString,
  Location,
  LocationLink,
  SymbolKind,
  SymbolInformation,
  DocumentSymbol,
  TextDocumentIdentifier,
  VersionedTextDocumentIdentifier,
  TextDocumentItem,
} from 'vscode-languageserver-types';

/**
 * Severity level names for formatting diagnostics
 */
export const SEVERITY_NAMES: Record<number, string> = {
  1: 'ERROR',
  2: 'WARN',
  3: 'INFO',
  4: 'HINT',
};

/**
 * Parameters for textDocument/publishDiagnostics notification
 */
export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: VSDiagnostic[];
}

/**
 * Parameters for textDocument/didOpen notification
 */
export interface DidOpenTextDocumentParams {
  textDocument: VSTextDocumentItem;
}

/**
 * Parameters for textDocument/didChange notification
 */
export interface DidChangeTextDocumentParams {
  textDocument: VSVersionedTextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

/**
 * Content change event for didChange notification
 */
export interface TextDocumentContentChangeEvent {
  range?: VSRange;
  rangeLength?: number;
  text: string;
}

/**
 * Parameters for textDocument/hover request
 */
export interface HoverParams {
  textDocument: VSTextDocumentIdentifier;
  position: VSPosition;
}

/**
 * LSP Initialize request parameters (simplified)
 */
export interface InitializeParams {
  processId: number | null;
  rootUri: string | null;
  capabilities: ClientCapabilities;
  workspaceFolders?: WorkspaceFolder[] | null;
  initializationOptions?: unknown;
}

/**
 * Client capabilities (simplified - only what we use)
 */
export interface ClientCapabilities {
  textDocument?: {
    synchronization?: {
      didOpen?: boolean;
      didChange?: boolean;
    };
    publishDiagnostics?: {
      versionSupport?: boolean;
    };
    hover?: {
      contentFormat?: string[];
    };
  };
  workspace?: {
    configuration?: boolean;
    workspaceFolders?: boolean;
  };
}

/**
 * Workspace folder
 */
export interface WorkspaceFolder {
  uri: string;
  name: string;
}

/**
 * Initialize result from server
 */
export interface InitializeResult {
  capabilities: ServerCapabilities;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

/**
 * Server capabilities (simplified)
 */
export interface ServerCapabilities {
  textDocumentSync?: number | TextDocumentSyncOptions;
  hoverProvider?: boolean;
  completionProvider?: unknown;
  diagnosticProvider?: unknown;
}

/**
 * Text document sync options
 */
export interface TextDocumentSyncOptions {
  openClose?: boolean;
  change?: number;
}
