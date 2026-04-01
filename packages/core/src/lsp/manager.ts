/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LspClient, LspTimeoutError } from './client.js';
import { LspServerRegistry } from './server-registry.js';
import type {
  Diagnostic,
  DocumentSymbol,
  Hover,
  LspServerDefinition,
  LspSettings,
  Location,
  SymbolInformation,
} from './types.js';
import { DEFAULT_LSP_SETTINGS } from './types.js';
import { debugLogger as logger } from '../utils/debugLogger.js';

/**
 * Key for identifying a server instance: `serverId:projectRoot`.
 */
type ServerKey = string;

/**
 * Result of a diagnostics query, distinguishing "no issues" from "timed out".
 */
export interface DiagnosticsResult {
  diagnostics: Diagnostic[];
  timedOut: boolean;
}

/**
 * Per-server state: client, caches, timeout, and error tracking.
 * All state for a given (serverId, projectRoot) pair is bundled here
 * so it can be cleanly created and destroyed together.
 */
interface ServerState {
  client: LspClient | null;
  broken: boolean;
  error?: string;
  starting?: Promise<LspClient | null>;
  diagnosticCache: Map<string, Diagnostic[]>;
  fileVersions: Map<string, number>;
  timeout: number;
}

/**
 * Status information for a single LSP server, exposed to the UI via `/lsp`.
 */
export interface LspServerStatus {
  id: string;
  state: 'running' | 'starting' | 'stopped' | 'failed';
  projectRoot?: string;
  error?: string;
  filesTracked: number;
  diagnosticsCached: number;
  command: string;
  args: string[];
  languageIds: string[];
}

/**
 * Manages LSP client lifecycles, caching, and queries.
 *
 * This is a singleton — one per CLI session. It lazily spawns language
 * servers on first access, caches them by (serverId, projectRoot), and
 * handles graceful shutdown.
 */
export class LspManager {
  private readonly servers = new Map<ServerKey, ServerState>();
  private readonly registry: LspServerRegistry;
  private readonly settings: LspSettings;
  private workspaceDirs: string[];

  /** Track how many server processes are alive for maxServers enforcement. */
  private activeServerCount = 0;

  private static readonly MIN_TIMEOUT = 1000;
  private static readonly COLD_START_MULTIPLIER = 3;

  constructor(settings?: Partial<LspSettings>, workspaceDirs?: string[]) {
    this.settings = { ...DEFAULT_LSP_SETTINGS, ...settings };
    this.registry = new LspServerRegistry(this.settings.servers);
    this.workspaceDirs = workspaceDirs ?? [];
  }

  /**
   * Update workspace folders. Called when gemini-cli's workspace context
   * changes (e.g., user adds a directory via /directory). Restarts all
   * running servers so they see the new workspace layout.
   */
  async updateWorkspaceFolders(dirs: string[]): Promise<void> {
    this.workspaceDirs = dirs;
    // Restart all servers so they reinitialize with updated folders.
    await this.restart();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Notify the LSP server that a file was read. Keeps the server's
   * in-memory state warm. Fire-and-forget — never throws or blocks.
   */
  async touchFile(filePath: string, content?: string): Promise<void> {
    try {
      const resolved = await this.resolveServer(filePath);
      if (!resolved) return;
      const { client, state } = resolved;

      const uri = filePathToUri(filePath);
      const languageId = this.registry.getLanguageId(filePath);
      if (!languageId) return;

      const version = (state.fileVersions.get(uri) ?? 0) + 1;
      state.fileVersions.set(uri, version);

      if (version === 1) {
        const text =
          content ?? (await fs.readFile(filePath, 'utf-8').catch(() => ''));
        client.didOpen(uri, languageId, text);
      } else if (content !== undefined) {
        client.didChange(uri, version, content);
      }
    } catch {
      // touchFile is supplementary — never fail.
    }
  }

  /**
   * Get diagnostics for a file. If the file hasn't been opened yet, opens
   * it first. Waits up to the adaptive timeout for the server to publish
   * diagnostics.
   */
  async getDiagnostics(
    filePath: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<DiagnosticsResult> {
    try {
      const serverDef = this.registry.getServerForFile(filePath);
      if (!serverDef) return { diagnostics: [], timedOut: false };

      const resolved = await this.resolveServer(filePath, signal);
      if (!resolved) return { diagnostics: [], timedOut: false };
      const { client, state } = resolved;

      const uri = filePathToUri(filePath);
      const languageId = this.registry.getLanguageId(filePath);
      if (!languageId) return { diagnostics: [], timedOut: false };

      // Start listening BEFORE sending the document to avoid a race where
      // the server publishes diagnostics before our listener is attached.
      const diagnosticsPromise = client.waitForDiagnostics(
        uri,
        state.timeout,
        signal,
      );

      // Open or update the document, then notify the server it was saved.
      const version = (state.fileVersions.get(uri) ?? 0) + 1;
      state.fileVersions.set(uri, version);

      if (version === 1) {
        client.didOpen(uri, languageId, content);
      } else {
        client.didChange(uri, version, content);
      }
      client.didSave(uri);

      // Also notify about the on-disk change so servers using client-side
      // file watching (e.g. TypeScript 5.0+ with canUseWatchEvents) detect it.
      client.didChangeWatchedFiles([{ uri, type: 2 }]);

      // Wait for the server to publish diagnostics.
      // null = timeout (server didn't respond), [] = server said "clean".
      const result = await diagnosticsPromise;
      const timedOut = result === null;
      const diagnostics = result ?? [];

      // Adaptive timeout: on success, settle to configured value.
      // On timeout, halve for next attempt.
      this.updateTimeout(state, timedOut);

      // Cache for later diff comparisons.
      state.diagnosticCache.set(uri, diagnostics);

      return { diagnostics, timedOut };
    } catch (e) {
      logger.debug(`LSP getDiagnostics error: ${e}`);
      return { diagnostics: [], timedOut: false };
    }
  }

  /**
   * Get cached diagnostics from the most recent getDiagnostics() call.
   */
  getCachedDiagnostics(filePath: string): Diagnostic[] {
    const uri = filePathToUri(filePath);
    for (const state of this.servers.values()) {
      const cached = state.diagnosticCache.get(uri);
      if (cached) return cached;
    }
    return [];
  }

  /**
   * Get all cached diagnostics across all servers and files.
   * Useful for workspace-wide diagnostic summaries.
   */
  getAllCachedDiagnostics(): Map<string, Diagnostic[]> {
    const all = new Map<string, Diagnostic[]>();
    for (const state of this.servers.values()) {
      for (const [uri, diags] of state.diagnosticCache) {
        if (diags.length > 0) {
          all.set(uri, diags);
        }
      }
    }
    return all;
  }

  /** Request hover info at a position. */
  async getHover(
    filePath: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Hover | null> {
    try {
      const resolved = await this.resolveServer(filePath, signal);
      if (!resolved) return null;
      return await resolved.client.hover(
        filePathToUri(filePath),
        line,
        character,
        signal,
      );
    } catch (e) {
      if (e instanceof LspTimeoutError) throw e;
      return null;
    }
  }

  /** Request go-to-definition. */
  async getDefinition(
    filePath: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Location[]> {
    try {
      const resolved = await this.resolveServer(filePath, signal);
      if (!resolved) return [];
      const result = await resolved.client.definition(
        filePathToUri(filePath),
        line,
        character,
        signal,
      );
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    } catch (e) {
      if (e instanceof LspTimeoutError) throw e;
      return [];
    }
  }

  /** Request all references to a symbol. */
  async getReferences(
    filePath: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Location[]> {
    try {
      const resolved = await this.resolveServer(filePath, signal);
      if (!resolved) return [];
      return (
        (await resolved.client.references(
          filePathToUri(filePath),
          line,
          character,
          signal,
        )) ?? []
      );
    } catch (e) {
      if (e instanceof LspTimeoutError) throw e;
      return [];
    }
  }

  /** Request document symbols. */
  async getDocumentSymbols(
    filePath: string,
    signal?: AbortSignal,
  ): Promise<DocumentSymbol[] | SymbolInformation[]> {
    try {
      const resolved = await this.resolveServer(filePath, signal);
      if (!resolved) return [];
      return (
        (await resolved.client.documentSymbols(
          filePathToUri(filePath),
          signal,
        )) ?? []
      );
    } catch (e) {
      if (e instanceof LspTimeoutError) throw e;
      return [];
    }
  }

  /** Search workspace symbols. */
  async getWorkspaceSymbols(
    query: string,
    filePath: string,
    signal?: AbortSignal,
  ): Promise<SymbolInformation[]> {
    try {
      const resolved = await this.resolveServer(filePath, signal);
      if (!resolved) return [];
      return (await resolved.client.workspaceSymbols(query, signal)) ?? [];
    } catch (e) {
      if (e instanceof LspTimeoutError) throw e;
      return [];
    }
  }

  /** Check whether LSP is available for the given file type. */
  hasServerFor(filePath: string): boolean {
    return this.registry.getServerForFile(filePath) !== undefined;
  }

  /**
   * Get status information for all known servers. Used by `/lsp status`.
   */
  getStatus(): LspServerStatus[] {
    const statuses: LspServerStatus[] = [];

    for (const serverDef of this.registry.getAllServers()) {
      let found = false;

      for (const [key, state] of this.servers) {
        if (!key.startsWith(`${serverDef.id}:`)) continue;
        found = true;
        const projectRoot = key.substring(serverDef.id.length + 1);

        if (state.broken) {
          statuses.push({
            id: serverDef.id,
            state: 'failed',
            projectRoot,
            error: state.error,
            filesTracked: 0,
            diagnosticsCached: 0,
            command: serverDef.command,
            args: serverDef.args,
            languageIds: serverDef.languageIds,
          });
        } else {
          let totalDiags = 0;
          for (const diags of state.diagnosticCache.values()) {
            totalDiags += diags.length;
          }
          statuses.push({
            id: serverDef.id,
            state: state.client?.isAlive ? 'running' : 'stopped',
            projectRoot,
            filesTracked: state.fileVersions.size,
            diagnosticsCached: totalDiags,
            command: serverDef.command,
            args: serverDef.args,
            languageIds: serverDef.languageIds,
          });
        }
      }

      // Server is configured but hasn't been used yet.
      if (!found) {
        statuses.push({
          id: serverDef.id,
          state: 'stopped',
          filesTracked: 0,
          diagnosticsCached: 0,
          command: serverDef.command,
          args: serverDef.args,
          languageIds: serverDef.languageIds,
        });
      }
    }

    return statuses;
  }

  /** Get the current settings (for display in `/lsp status`). */
  getSettings(): LspSettings {
    return { ...this.settings };
  }

  /** Shut down all active language server processes and clear all state. */
  async shutdown(): Promise<void> {
    const shutdowns: Array<Promise<void>> = [];
    for (const state of this.servers.values()) {
      if (state.client) {
        shutdowns.push(state.client.shutdown().catch(() => {}));
      }
    }
    await Promise.allSettled(shutdowns);
    this.servers.clear();
    this.activeServerCount = 0;
  }

  /**
   * Restart all servers: shut down running servers and eagerly re-spawn them.
   * Servers that were previously running are restarted immediately rather
   * than waiting for first use.
   */
  async restart(): Promise<void> {
    // Collect which servers were alive before shutdown.
    const liveKeys: ServerKey[] = [];
    for (const [key, state] of this.servers.entries()) {
      if (state.client?.isAlive) {
        liveKeys.push(key);
      }
    }

    await this.shutdown();

    // Re-spawn previously running servers.
    for (const key of liveKeys) {
      const sepIdx = key.indexOf(':');
      if (sepIdx === -1) continue;
      const serverId = key.substring(0, sepIdx);
      const projectRoot = key.substring(sepIdx + 1);

      const serverDef = this.registry
        .getAllServers()
        .find((s) => s.id === serverId);
      if (!serverDef) continue;

      const state = this.getOrCreateState(key);
      const promise = this.startClient(state, serverDef, projectRoot);
      state.starting = promise;
      // Fire-and-forget: don't block on startup.
      promise
        .then(() => {
          state.starting = undefined;
        })
        .catch(() => {
          state.starting = undefined;
        });
    }
  }

  // -----------------------------------------------------------------------
  // Server lifecycle (private)
  // -----------------------------------------------------------------------

  /**
   * Resolve a file path to a running server and its state.
   * Returns null if no server is available for this file type.
   */
  private async resolveServer(
    filePath: string,
    signal?: AbortSignal,
  ): Promise<{ client: LspClient; state: ServerState; key: ServerKey } | null> {
    const serverDef = this.registry.getServerForFile(filePath);
    if (!serverDef) return null;

    // Use the gemini-cli workspace directory that contains this file,
    // falling back to marker-based root detection.
    const resolvedPath = path.resolve(filePath);
    const workspaceDir = this.workspaceDirs.find((dir) =>
      resolvedPath.startsWith(path.resolve(dir)),
    );
    const projectRoot =
      workspaceDir ?? (await this.findProjectRoot(filePath, serverDef));
    // Key format: "serverId:projectRoot". The first colon is the separator;
    // server IDs never contain colons. On Windows the projectRoot will
    // contain a drive colon (e.g. "C:\...") which is fine — restart()
    // parses using indexOf(':') to find only the first one.
    const key = `${serverDef.id}:${projectRoot}`;

    const state = this.getOrCreateState(key);

    // Already running?
    if (state.client?.isAlive) {
      return { client: state.client, state, key };
    }

    // Known broken?
    if (state.broken) return null;

    // Already starting? Wait for it.
    if (state.starting) {
      const client = await state.starting;
      return client ? { client, state, key } : null;
    }

    // Start a new client.
    const promise = this.startClient(state, serverDef, projectRoot, signal);
    state.starting = promise;

    try {
      const client = await promise;
      return client ? { client, state, key } : null;
    } finally {
      state.starting = undefined;
    }
  }

  private getOrCreateState(key: ServerKey): ServerState {
    let state = this.servers.get(key);
    if (!state) {
      state = {
        client: null,
        broken: false,
        diagnosticCache: new Map(),
        fileVersions: new Map(),
        timeout:
          this.settings.diagnosticTimeout * LspManager.COLD_START_MULTIPLIER,
      };
      this.servers.set(key, state);
    }
    return state;
  }

  private async startClient(
    state: ServerState,
    serverDef: LspServerDefinition,
    projectRoot: string,
    signal?: AbortSignal,
  ): Promise<LspClient | null> {
    if (this.activeServerCount >= this.settings.maxServers) {
      logger.debug(
        `LSP: max servers (${this.settings.maxServers}) reached, skipping ${serverDef.id}`,
      );
      return null;
    }

    const rootUri = pathToFileURL(projectRoot).href;
    const workspaceFolderUris = this.workspaceDirs.map(
      (dir) => pathToFileURL(path.resolve(dir)).href,
    );
    const client = new LspClient(serverDef, rootUri, workspaceFolderUris);

    client.on('exit', () => {
      state.client = null;
      this.activeServerCount = Math.max(0, this.activeServerCount - 1);
    });

    client.on('error', (err: Error) => {
      state.client = null;
      state.broken = true;
      state.error = err.message;
      this.activeServerCount = Math.max(0, this.activeServerCount - 1);
    });

    try {
      await client.start(signal);
      state.client = client;
      this.activeServerCount++;

      // Listen for ALL diagnostics from this server, not just the ones
      // we explicitly wait for. Servers publish diagnostics for transitive
      // dependents (e.g., changing a function signature triggers diagnostics
      // in all importers). Cache them all.
      client.on('diagnostics', (params) => {
        state.diagnosticCache.set(params.uri, params.diagnostics);
      });

      logger.debug(`LSP: started ${serverDef.id} server for ${projectRoot}`);
      return client;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.debug(`LSP: failed to start ${serverDef.id}: ${errMsg}`);
      state.broken = true;
      state.error = errMsg;
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Adaptive timeout
  // -----------------------------------------------------------------------

  private updateTimeout(state: ServerState, timedOut: boolean): void {
    if (!timedOut) {
      state.timeout = this.settings.diagnosticTimeout;
    } else {
      state.timeout = Math.max(
        LspManager.MIN_TIMEOUT,
        Math.floor(state.timeout / 2),
      );
    }
  }

  // -----------------------------------------------------------------------
  // Project root detection
  // -----------------------------------------------------------------------

  private async findProjectRoot(
    filePath: string,
    serverDef: LspServerDefinition,
  ): Promise<string> {
    let dir = path.dirname(path.resolve(filePath));
    const root = path.parse(dir).root;

    while (true) {
      for (const marker of serverDef.rootMarkers) {
        try {
          await fs.access(path.join(dir, marker));
          return dir;
        } catch {
          // Marker not found, continue.
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir || dir === root) break;
      dir = parent;
    }

    return path.dirname(path.resolve(filePath));
  }
}

/**
 * Convert a file system path to a file:// URI.
 */
function filePathToUri(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href;
}
