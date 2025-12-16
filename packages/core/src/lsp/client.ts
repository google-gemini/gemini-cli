/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Client
 *
 * Manages a single connection to an LSP server, handling initialization,
 * document synchronization, and request/response communication.
 */

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/lib/node/main.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { ServerHandle } from './server.js';
import { getLanguageId } from './language.js';
import type {
  Diagnostic,
  Hover,
  PublishDiagnosticsParams,
  InitializeParams,
  InitializeResult,
} from './types.js';

/**
 * Configuration for the LSP client
 */
export interface LSPClientConfig {
  /** Timeout for the initialize request in milliseconds */
  initializeTimeout?: number;
  /** Timeout for waiting for diagnostics in milliseconds */
  diagnosticsTimeout?: number;
}

const DEFAULT_CONFIG: Required<LSPClientConfig> = {
  initializeTimeout: 45000, // 45 seconds
  diagnosticsTimeout: 3000, // 3 seconds
};

/**
 * Interface for an active LSP client
 */
export interface LSPClient {
  /** The server ID this client is connected to */
  readonly serverID: string;
  /** The workspace root directory */
  readonly root: string;
  /** The underlying JSON-RPC connection */
  readonly connection: MessageConnection;
  /** Current diagnostics by file path */
  readonly diagnostics: Map<string, Diagnostic[]>;

  /**
   * Notify the server that a file has been opened or changed.
   * @param filePath - Absolute path to the file
   * @param content - The file content
   */
  notifyFileOpened(filePath: string, content: string): Promise<void>;

  /**
   * Notify the server that a file has changed.
   * @param filePath - Absolute path to the file
   * @param content - The new file content
   */
  notifyFileChanged(filePath: string, content: string): Promise<void>;

  /**
   * Request hover information at a specific position.
   * @param filePath - Absolute path to the file
   * @param line - Line number (0-indexed)
   * @param character - Character position (0-indexed)
   * @returns Hover information or null if not available
   */
  requestHover(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Hover | null>;

  /**
   * Wait for diagnostics to be published for a file.
   * @param filePath - Absolute path to the file
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @param signal - Optional AbortSignal for cancellation
   * @returns Array of diagnostics for the file
   */
  waitForDiagnostics(
    filePath: string,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<Diagnostic[]>;

  /**
   * Shutdown the client and kill the server process.
   */
  shutdown(): Promise<void>;
}

/**
 * Create a new LSP client connected to a server.
 *
 * @param serverID - Identifier for the server
 * @param server - Handle to the spawned server process
 * @param root - Workspace root directory
 * @param config - Optional client configuration
 * @returns The initialized LSP client
 */
export async function createClient(
  serverID: string,
  server: ServerHandle,
  root: string,
  config: LSPClientConfig = {},
): Promise<LSPClient> {
  const { initializeTimeout, diagnosticsTimeout } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Create the JSON-RPC connection over stdio
  const connection = createMessageConnection(
    new StreamMessageReader(server.process.stdout!),
    new StreamMessageWriter(server.process.stdin!),
  );

  // Track diagnostics by file path
  const diagnostics = new Map<string, Diagnostic[]>();

  // Track file versions for proper synchronization
  const fileVersions = new Map<string, number>();

  // Handle diagnostics notifications from the server
  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: PublishDiagnosticsParams) => {
      try {
        const filePath = fileURLToPath(params.uri);
        diagnostics.set(filePath, params.diagnostics);
      } catch (_error) {
        // Ignore malformed URIs
      }
    },
  );

  // Handle workspace configuration requests
  connection.onRequest('workspace/configuration', () =>
    // Return empty configuration - server will use defaults
    [],
  );

  // Handle capability registration requests (common in newer LSP versions)
  connection.onRequest('client/registerCapability', () => null);

  connection.onRequest('client/unregisterCapability', () => null);

  // Handle workspace folder requests
  connection.onRequest('workspace/workspaceFolders', () => [
    { uri: pathToFileURL(root).href, name: 'workspace' },
  ]);

  // Start listening for messages
  connection.listen();

  // Initialize the server with the LSP handshake
  const initializeParams: InitializeParams = {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    capabilities: {
      textDocument: {
        synchronization: {
          didOpen: true,
          didChange: true,
        },
        publishDiagnostics: {
          versionSupport: true,
        },
        hover: {
          contentFormat: ['markdown', 'plaintext'],
        },
      },
      workspace: {
        configuration: true,
        workspaceFolders: true,
      },
    },
    workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'workspace' }],
    initializationOptions: server.initialization,
  };

  // Send initialize request with timeout
  const initializePromise = connection.sendRequest<InitializeResult>(
    'initialize',
    initializeParams,
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            `LSP initialization timed out after ${initializeTimeout}ms`,
          ),
        ),
      initializeTimeout,
    );
  });

  try {
    await Promise.race([initializePromise, timeoutPromise]);
  } catch (error) {
    connection.dispose();
    server.process.kill();
    throw error;
  }

  // Send initialized notification
  await connection.sendNotification('initialized', {});

  // Send workspace configuration notification
  await connection.sendNotification('workspace/didChangeConfiguration', {
    settings: server.initialization ?? {},
  });

  // Return the client interface
  return {
    serverID,
    root,
    connection,
    diagnostics,

    async notifyFileOpened(filePath: string, content: string): Promise<void> {
      const uri = pathToFileURL(filePath).href;
      const languageId = getLanguageId(filePath) ?? 'plaintext';
      const version = 1;

      fileVersions.set(filePath, version);

      // Clear any existing diagnostics for this file
      diagnostics.delete(filePath);

      await connection.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version,
          text: content,
        },
      });
    },

    async notifyFileChanged(filePath: string, content: string): Promise<void> {
      const uri = pathToFileURL(filePath).href;
      const currentVersion = fileVersions.get(filePath) ?? 0;
      const nextVersion = currentVersion + 1;

      fileVersions.set(filePath, nextVersion);

      // Clear diagnostics to prepare for new ones
      diagnostics.delete(filePath);

      // We use TextDocumentSyncKind.Full (sending entire file content).
      // This is simpler than incremental sync which would require tracking
      // edit ranges. For our use case (syncing after file operations complete,
      // not continuous typing), full sync is adequate for typical file sizes.
      // TODO: Consider incremental sync for very large files (>1MB) if needed.
      await connection.sendNotification('textDocument/didChange', {
        textDocument: {
          uri,
          version: nextVersion,
        },
        contentChanges: [{ text: content }],
      });
    },

    async requestHover(
      filePath: string,
      line: number,
      character: number,
    ): Promise<Hover | null> {
      try {
        const result = await connection.sendRequest<Hover | null>(
          'textDocument/hover',
          {
            textDocument: { uri: pathToFileURL(filePath).href },
            position: { line, character },
          },
        );
        return result;
      } catch (_error) {
        // Request failed - return null
        return null;
      }
    },

    async waitForDiagnostics(
      filePath: string,
      timeoutMs: number = diagnosticsTimeout,
      signal?: AbortSignal,
    ): Promise<Diagnostic[]> {
      const startTime = Date.now();

      // Poll for diagnostics with a short interval
      while (Date.now() - startTime < timeoutMs) {
        // Check for cancellation
        if (signal?.aborted) {
          return diagnostics.get(filePath) ?? [];
        }

        const fileDiagnostics = diagnostics.get(filePath);
        if (fileDiagnostics !== undefined) {
          return fileDiagnostics;
        }
        // Wait a short time before checking again
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Return whatever we have (possibly empty array)
      return diagnostics.get(filePath) ?? [];
    },

    async shutdown(): Promise<void> {
      try {
        // Try to send shutdown request
        await Promise.race([
          connection.sendRequest('shutdown'),
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
        await connection.sendNotification('exit');
      } catch {
        // Ignore errors during shutdown
      } finally {
        connection.end();
        connection.dispose();
        server.process.kill();
      }
    },
  };
}

/**
 * Extract text content from a Hover response.
 *
 * @param hover - The hover response from the server
 * @returns The text content as a string
 */
export function extractHoverContent(hover: Hover | null): string | null {
  if (!hover || !hover.contents) {
    return null;
  }

  const contents = hover.contents;

  // Handle MarkedString[] (array of strings or { language, value })
  if (Array.isArray(contents)) {
    return contents
      .map((item) => (typeof item === 'string' ? item : item.value))
      .join('\n');
  }

  // Handle MarkupContent ({ kind, value })
  if (typeof contents === 'object' && 'value' in contents) {
    return contents.value;
  }

  // Handle plain string
  if (typeof contents === 'string') {
    return contents;
  }

  return null;
}
