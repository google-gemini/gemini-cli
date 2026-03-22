/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type {
  InitializeParams,
  InitializeResult,
  Diagnostic,
  PublishDiagnosticsParams,
  DocumentSymbol,
  SymbolInformation,
  Hover,
  Location,
  LspServerDefinition,
} from './types.js';
import { isRecord } from '../utils/markdownUtils.js';

/**
 * Thrown when an LSP request times out. Exported so callers can distinguish
 * a timeout from a genuine "no results" response.
 */
export class LspTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`LSP request '${method}' timed out after ${timeoutMs}ms`);
    this.name = 'LspTimeoutError';
  }
}

/**
 * Events emitted by LspClient.
 *
 * - `diagnostics`: Published when the server sends a
 *   `textDocument/publishDiagnostics` notification.
 * - `exit`: The server process exited. Payload is the exit code.
 * - `error`: The server process encountered a spawn or runtime error.
 */
interface LspClientEvents {
  diagnostics: [params: PublishDiagnosticsParams];
  exit: [code: number | null];
  error: [err: Error];
}

/**
 * Minimal JSON-RPC client that communicates with an LSP server over stdio.
 *
 * Handles the LSP base protocol framing (Content-Length headers), message
 * routing, and the initialize/shutdown lifecycle.
 */
export class LspClient extends EventEmitter<LspClientEvents> {
  private process: ChildProcess | null = null;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private initialized = false;
  private _serverCapabilities: InitializeResult['capabilities'] | null = null;

  constructor(
    private readonly serverDef: LspServerDefinition,
    private readonly rootUri: string,
    private readonly workspaceFolderUris: string[] = [],
    private readonly requestTimeout: number = 10_000,
  ) {
    super();
  }

  get serverCapabilities(): InitializeResult['capabilities'] | null {
    return this._serverCapabilities;
  }

  get isAlive(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * Spawn the language server process and perform the LSP initialize
   * handshake.
   */
  async start(signal?: AbortSignal): Promise<InitializeResult> {
    if (this.process) {
      throw new Error('LspClient already started');
    }

    this.process = spawn(this.serverDef.command, this.serverDef.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: this.serverDef.useShell,
    });

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.onData(chunk.toString('utf-8'));
    });

    // Absorb stderr — language servers are chatty.
    this.process.stderr!.on('data', () => {});

    this.process.on('exit', (code) => {
      this.emit('exit', code);
      this.rejectAllPending(
        new Error(`Language server exited with code ${code}`),
      );
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
      this.rejectAllPending(err);
    });

    const initParams: InitializeParams = {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true },
          hover: { contentFormat: ['plaintext', 'markdown'] },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          synchronization: { didSave: true },
        },
        workspace: {
          symbol: {},
          workspaceFolders: true,
          configuration: true,
          didChangeConfiguration: { dynamicRegistration: true },
        },
        window: {
          workDoneProgress: true,
        },
      },
      workspaceFolders:
        this.workspaceFolderUris.length > 0
          ? this.workspaceFolderUris.map((uri) => ({
              uri,
              name: uri.split('/').pop() || '',
            }))
          : [{ uri: this.rootUri, name: this.rootUri.split('/').pop() || '' }],
      initializationOptions: this.serverDef.initializationOptions,
    };

    const result = await this.sendRequest<InitializeResult>(
      'initialize',
      initParams,
      signal,
    );

    this._serverCapabilities = result.capabilities;

    // Send initialized notification.
    this.sendNotification('initialized', {});

    // Send didChangeConfiguration to trigger workspace analysis. Pyright
    // requires this to initialize workspaces and publish diagnostics.
    // See: https://github.com/microsoft/pyright/issues/6874
    this.sendNotification('workspace/didChangeConfiguration', { settings: {} });

    this.initialized = true;

    return result;
  }

  /**
   * Notify the server that a document was opened.
   */
  didOpen(uri: string, languageId: string, text: string): void {
    if (!this.initialized) return;
    this.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  /**
   * Notify the server that a document changed (full sync).
   */
  didChange(uri: string, version: number, text: string): void {
    if (!this.initialized) return;
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  /**
   * Notify the server that a document was saved.
   * Some servers use this as a trigger for heavier analysis.
   */
  didSave(uri: string, text?: string): void {
    if (!this.initialized) return;
    this.sendNotification('textDocument/didSave', {
      textDocument: { uri },
      ...(text !== undefined ? { text } : {}),
    });
  }

  /**
   * Notify the server that a document was closed.
   */
  didClose(uri: string): void {
    if (!this.initialized) return;
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * Notify the server that files changed on disk. This is important for
   * files the agent creates, deletes, or modifies without opening via
   * didOpen — servers relying on client-side watching will miss changes
   * without this.
   *
   * FileChangeType: 1 = Created, 2 = Changed, 3 = Deleted
   */
  didChangeWatchedFiles(
    changes: Array<{ uri: string; type: 1 | 2 | 3 }>,
  ): void {
    if (!this.initialized) return;
    this.sendNotification('workspace/didChangeWatchedFiles', { changes });
  }

  /**
   * Request diagnostics by opening/updating a document and waiting for
   * `textDocument/publishDiagnostics` notifications.
   *
   * @returns The diagnostics array from the server, or `null` if the server
   *   did not respond within the timeout. An empty array means the server
   *   explicitly reported no issues.
   */
  async waitForDiagnostics(
    uri: string,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<Diagnostic[] | null> {
    return new Promise<Diagnostic[] | null>((resolve) => {
      const cleanup = {
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
      };

      const handler = (params: PublishDiagnosticsParams) => {
        if (
          params.uri === uri ||
          normalizeUri(params.uri) === normalizeUri(uri)
        ) {
          clearTimeout(cleanup.timer);
          this.off('diagnostics', handler);
          resolve(params.diagnostics);
        }
      };

      this.on('diagnostics', handler);

      cleanup.timer = setTimeout(() => {
        this.off('diagnostics', handler);
        // null signals "no response" vs [] which means "server said clean".
        resolve(null);
      }, timeout);

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(cleanup.timer);
            this.off('diagnostics', handler);
            resolve(null);
          },
          { once: true },
        );
      }
    });
  }

  /**
   * Request hover information at a position.
   */
  async hover(
    uri: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Hover | null> {
    return this.sendRequest<Hover | null>(
      'textDocument/hover',
      {
        textDocument: { uri },
        position: { line, character },
      },
      signal,
    );
  }

  /**
   * Request go-to-definition.
   */
  async definition(
    uri: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Location | Location[] | null> {
    return this.sendRequest<Location | Location[] | null>(
      'textDocument/definition',
      {
        textDocument: { uri },
        position: { line, character },
      },
      signal,
    );
  }

  /**
   * Request all references to a symbol.
   */
  async references(
    uri: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Location[] | null> {
    return this.sendRequest<Location[] | null>(
      'textDocument/references',
      {
        textDocument: { uri },
        position: { line, character },
        context: { includeDeclaration: true },
      },
      signal,
    );
  }

  /**
   * Request document symbols.
   */
  async documentSymbols(
    uri: string,
    signal?: AbortSignal,
  ): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return this.sendRequest<DocumentSymbol[] | SymbolInformation[] | null>(
      'textDocument/documentSymbol',
      { textDocument: { uri } },
      signal,
    );
  }

  /**
   * Search workspace symbols.
   */
  async workspaceSymbols(
    query: string,
    signal?: AbortSignal,
  ): Promise<SymbolInformation[] | null> {
    return this.sendRequest<SymbolInformation[] | null>(
      'workspace/symbol',
      { query },
      signal,
    );
  }

  /**
   * Gracefully shut down the server.
   */
  async shutdown(): Promise<void> {
    if (!this.process || !this.isAlive) return;
    try {
      await this.sendRequest('shutdown', null, undefined, 5000);
      this.sendNotification('exit', undefined);
    } catch {
      // If shutdown request fails, force kill.
    }
    this.forceKill();
  }

  private forceKill(): void {
    if (this.process && this.isAlive) {
      this.process.kill('SIGTERM');
      // Give it a moment, then SIGKILL.
      setTimeout(() => {
        if (this.process && this.isAlive) {
          this.process.kill('SIGKILL');
        }
      }, 1000);
    }
    this.process = null;
  }

  // -----------------------------------------------------------------------
  // JSON-RPC protocol
  // -----------------------------------------------------------------------

  // The generic parameter T is a trust assertion: we trust the LSP server
  // to return the type specified by the protocol for each method. This is
  // unavoidable in a JSON-RPC client where responses are untyped `unknown`.
  private sendRequest<T = unknown>(
    method: string,
    params: unknown,
    signal?: AbortSignal,
    timeout?: number,
  ): Promise<T> {
    const id = this.nextId++;
    const message = { jsonrpc: '2.0', id, method, params };
    this.writeMessage(message);

    return new Promise<T>((resolve, reject) => {
      const effectiveTimeout = timeout ?? this.requestTimeout;

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new LspTimeoutError(method, effectiveTimeout));
      }, effectiveTimeout);

      const wrappedResolve = (value: unknown) => resolve(value as T); // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
      this.pending.set(id, { resolve: wrappedResolve, reject, timer });

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(new Error('Aborted'));
          },
          { once: true },
        );
      }
    });
  }

  private sendNotification(method: string, params: unknown): void {
    this.writeMessage({ jsonrpc: '2.0', method, params });
  }

  private writeMessage(message: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) return;
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    this.process.stdin.write(header + body);
  }

  /**
   * Parse incoming data from stdout using the LSP base protocol framing.
   */
  private onData(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.substring(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Malformed header — skip past it.
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;

      if (this.buffer.length < bodyStart + contentLength) {
        // Incomplete body — wait for more data.
        break;
      }

      const body = this.buffer.substring(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.substring(bodyStart + contentLength);

      try {
        const parsed: unknown = JSON.parse(body);
        if (isRecord(parsed)) {
          this.handleMessage(parsed);
        }
      } catch {
        // Malformed JSON — skip.
      }
    }
  }

  private handleMessage(message: Record<string, unknown>): void {
    const id = message['id'];
    const method = message['method'];
    const error = message['error'];
    const result = message['result'];
    const params = message['params'];

    // Server-initiated request (has both id and method).
    // Must be checked before response handling since both have an `id`.
    if (id !== undefined && typeof method === 'string') {
      const reqId =
        typeof id === 'number' || typeof id === 'string' ? id : Number(id);
      this.handleServerRequest(
        reqId,
        method,
        isRecord(params) ? params : undefined,
      );
      return;
    }

    // Response to a request we sent.
    if (typeof id === 'number') {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (isRecord(error)) {
          pending.reject(
            new Error(String(error['message'] ?? 'Unknown LSP error')),
          );
        } else {
          pending.resolve(result);
        }
      }
      return;
    }

    // Notification from the server (has method but no id).
    if (typeof method === 'string') {
      if (
        method === 'textDocument/publishDiagnostics' &&
        isDiagnosticsParams(params)
      ) {
        this.emit('diagnostics', params);
      }
      // All other notifications (window/logMessage, etc.) are silently ignored.
    }
  }

  /**
   * Handle requests initiated by the server. Some language servers (notably
   * Pyright) send workspace/configuration requests and block until they
   * receive a response.
   */
  private handleServerRequest(
    id: number | string,
    method: string,
    params?: Record<string, unknown>,
  ): void {
    let responseResult: unknown = null;

    if (method === 'workspace/configuration') {
      // Respond with empty config for each requested item.
      const itemsRaw = params?.['items'];
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      responseResult = items.map(() => ({}));
    } else if (method === 'client/registerCapability') {
      responseResult = null;
    } else if (method === 'window/workDoneProgress/create') {
      responseResult = null;
    }
    // For any unrecognized request, respond with null to avoid blocking.

    this.writeMessage({ jsonrpc: '2.0', id, result: responseResult });
  }

  private rejectAllPending(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }
}

/**
 * Normalize a file URI for comparison. Handles:
 * - URL-encoded colons (`%3A`) in drive letters
 * - Case-insensitive drive letters on Windows
 * - Varying numbers of slashes after `file:`
 */
function normalizeUri(uri: string): string {
  try {
    // Decode percent-encoded characters first.
    let normalized = decodeURIComponent(uri);
    // Normalize to three slashes after file:
    normalized = normalized.replace(/^file:\/{1,3}/, 'file:///');
    // Lowercase the drive letter on Windows paths.
    normalized = normalized.replace(
      /^file:\/\/\/([a-zA-Z]):/,
      (_, drive: string) => `file:///${drive.toLowerCase()}:`,
    );
    return normalized;
  } catch {
    return uri;
  }
}

/**
 * Type guard for PublishDiagnosticsParams: checks that the value has the
 * required `uri` and `diagnostics` fields.
 */
function isDiagnosticsParams(
  value: unknown,
): value is PublishDiagnosticsParams {
  if (!isRecord(value)) return false;
  const { uri, diagnostics } = value;
  return typeof uri === 'string' && Array.isArray(diagnostics);
}
