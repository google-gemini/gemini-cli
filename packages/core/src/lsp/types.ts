/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP protocol types used by the LSP integration module.
 *
 * We define a minimal subset of the LSP specification here rather than taking
 * a dependency on vscode-languageserver-types, keeping the bundle lean. These
 * types are wire-compatible with the LSP 3.18 specification.
 */

// ---------------------------------------------------------------------------
// Diagnostic types
// ---------------------------------------------------------------------------

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface Position {
  /** Zero-based line number. */
  line: number;
  /** Zero-based character offset. */
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

// ---------------------------------------------------------------------------
// Document symbol types
// ---------------------------------------------------------------------------

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

// ---------------------------------------------------------------------------
// Hover types
// ---------------------------------------------------------------------------

export interface Hover {
  contents: MarkupContent | string;
  range?: Range;
}

export interface MarkupContent {
  kind: 'plaintext' | 'markdown';
  value: string;
}

// ---------------------------------------------------------------------------
// TextDocument synchronization
// ---------------------------------------------------------------------------

export enum TextDocumentSyncKind {
  None = 0,
  Full = 1,
  Incremental = 2,
}

// ---------------------------------------------------------------------------
// Initialize types
// ---------------------------------------------------------------------------

export interface InitializeParams {
  processId: number | null;
  rootUri: string | null;
  capabilities: ClientCapabilities;
  workspaceFolders?: WorkspaceFolder[] | null;
  initializationOptions?: Record<string, unknown>;
}

export interface ClientCapabilities {
  textDocument?: {
    publishDiagnostics?: {
      relatedInformation?: boolean;
    };
    hover?: {
      contentFormat?: string[];
    };
    documentSymbol?: {
      hierarchicalDocumentSymbolSupport?: boolean;
    };
    completion?: {
      completionItem?: {
        snippetSupport?: boolean;
      };
    };
    synchronization?: {
      didSave?: boolean;
    };
  };
  workspace?: {
    symbol?: Record<string, unknown>;
    workspaceFolders?: boolean;
    configuration?: boolean;
    didChangeConfiguration?: {
      dynamicRegistration?: boolean;
    };
  };
  window?: {
    workDoneProgress?: boolean;
  };
}

export interface WorkspaceFolder {
  uri: string;
  name: string;
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

export interface ServerCapabilities {
  textDocumentSync?: number | { openClose?: boolean; change?: number };
  hoverProvider?: boolean;
  definitionProvider?: boolean;
  referencesProvider?: boolean;
  documentSymbolProvider?: boolean;
  workspaceSymbolProvider?: boolean;
  completionProvider?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Publish diagnostics notification params
// ---------------------------------------------------------------------------

export interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// LSP module configuration
// ---------------------------------------------------------------------------

export interface LspSettings {
  enabled: boolean;
  diagnosticTimeout: number;
  maxServers: number;
  idleTimeout: number;
  servers?: Record<string, LspServerUserConfig>;
}

export interface LspServerUserConfig {
  command: string;
  args?: string[];
  /** LSP language IDs this server handles (required for user-defined servers). */
  languages?: string[];
  /** Files that indicate a project root for this language. */
  rootMarkers?: string[];
  /** Initialization options sent to the server during initialize. */
  initializationOptions?: Record<string, unknown>;
  /** Set to false to disable a built-in server. */
  enabled?: boolean;
}

export const DEFAULT_LSP_SETTINGS: LspSettings = {
  enabled: false,
  diagnosticTimeout: 5000,
  maxServers: 4,
  idleTimeout: 600_000, // 10 minutes
};

// ---------------------------------------------------------------------------
// Server definition (internal)
// ---------------------------------------------------------------------------

export interface LspServerDefinition {
  /** Unique identifier for this server type. */
  id: string;
  /** LSP language IDs this server handles. */
  languageIds: string[];
  /** Executable command to spawn the server. */
  command: string;
  /** Arguments passed to the command. */
  args: string[];
  /** Whether to use shell: true when spawning (needed for script wrappers). */
  useShell: boolean;
  /** Files that indicate a project root for this language. */
  rootMarkers: string[];
  /** Initialization options sent to the server. */
  initializationOptions?: Record<string, unknown>;
}
