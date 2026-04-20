/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Capabilities that an IDE adapter may support.
 * Used for capability negotiation between the CLI and IDE adapters.
 */
export enum IDECapability {
  /** Open a file in the editor */
  OpenFile = 'openFile',
  /** Navigate to a specific line in a file */
  GoToLine = 'goToLine',
  /** Show a diff view between two versions of content */
  ShowDiff = 'showDiff',
  /** Apply an edit to a file in the editor */
  ApplyEdit = 'applyEdit',
  /** Show a diagnostic message (error, warning, info) */
  ShowDiagnostic = 'showDiagnostic',
  /** Execute a command within the IDE */
  RunCommand = 'runCommand',
  /** Retrieve the current text selection from the active editor */
  GetSelection = 'getSelection',
  /** Display a notification to the user */
  ShowNotification = 'showNotification',
}

/**
 * Transport mechanism for communicating with an IDE.
 */
export type IDETransportType = 'stdio' | 'tcp' | 'websocket' | 'named-pipe';

/**
 * Configuration for connecting to an IDE instance.
 */
export interface IDEConnectionConfig {
  /** Transport protocol to use */
  transport: IDETransportType;
  /** Host address for TCP or WebSocket connections */
  host?: string;
  /** Port number for TCP or WebSocket connections */
  port?: number;
  /** Named pipe path for named-pipe connections */
  pipeName?: string;
}

/**
 * A message exchanged between the CLI and an IDE adapter,
 * following a JSON-RPC 2.0 inspired format.
 */
export interface IDEMessage {
  /** Whether this is a request, response, or one-way notification */
  type: 'request' | 'response' | 'notification';
  /** The method name being invoked or responded to */
  method: string;
  /** Parameters or result data */
  params?: Record<string, unknown>;
  /** Optional identifier for correlating requests and responses */
  id?: string;
  /** Error information, present only on error responses */
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Severity levels for diagnostic messages shown in the IDE.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

/**
 * Represents a text selection in an editor.
 */
export interface EditorSelection {
  /** Absolute path to the file */
  file: string;
  /** 1-based start line number */
  startLine: number;
  /** 1-based start column number */
  startCol: number;
  /** 1-based end line number */
  endLine: number;
  /** 1-based end column number */
  endCol: number;
  /** The selected text content */
  text: string;
}

/**
 * Notification level for messages shown to the user by the IDE.
 */
export type NotificationLevel = 'info' | 'warning' | 'error';

/**
 * Interface that all IDE adapters must implement.
 * Provides a uniform API for interacting with different IDEs.
 */
export interface IDEAdapter {
  /** Human-readable name of the IDE this adapter targets */
  readonly name: string;

  /** Set of capabilities this adapter supports */
  readonly capabilities: ReadonlySet<IDECapability>;

  /**
   * Establish a connection to the IDE.
   * @param config Connection configuration.
   */
  connect(config: IDEConnectionConfig): Promise<void>;

  /**
   * Disconnect from the IDE and clean up resources.
   */
  disconnect(): Promise<void>;

  /**
   * Whether the adapter currently has an active connection.
   */
  isConnected(): boolean;

  /**
   * Open a file in the IDE editor.
   * @param filePath Absolute path to the file.
   */
  openFile(filePath: string): Promise<void>;

  /**
   * Navigate to a specific line in a file.
   * @param filePath Absolute path to the file.
   * @param line 1-based line number.
   */
  goToLine(filePath: string, line: number): Promise<void>;

  /**
   * Show a diff between the current file content and proposed new content.
   * @param filePath Absolute path to the file.
   * @param newContent The proposed replacement content.
   */
  showDiff(filePath: string, newContent: string): Promise<void>;

  /**
   * Apply an edit to a file in the IDE.
   * @param filePath Absolute path to the file.
   * @param newContent The new content for the file.
   */
  applyEdit(filePath: string, newContent: string): Promise<void>;

  /**
   * Get the current text selection from the active editor.
   * @returns The current selection, or undefined if nothing is selected.
   */
  getSelection(): Promise<EditorSelection | undefined>;

  /**
   * Show a notification message in the IDE.
   * @param message The notification text.
   * @param level Severity level of the notification.
   */
  showNotification(message: string, level: NotificationLevel): Promise<void>;
}

/**
 * Result of capability negotiation, indicating which capabilities
 * are natively supported and which use fallback behavior.
 */
export interface NegotiatedCapabilities {
  /** Capabilities natively supported by the adapter */
  supported: ReadonlySet<IDECapability>;
  /** Capabilities that will use a fallback implementation */
  fallback: ReadonlySet<IDECapability>;
  /** Capabilities that are completely unavailable */
  unsupported: ReadonlySet<IDECapability>;
}
