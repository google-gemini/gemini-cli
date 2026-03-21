/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LspClient } from './client.js';
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
 * Key for caching LSP clients: `serverId:projectRoot`.
 */
type ClientKey = string;

/**
 * Manages LSP client lifecycles, caching, and queries.
 *
 * This is a singleton — one per CLI session. It lazily spawns language
 * servers on first access, caches them by (serverId, projectRoot), and
 * handles graceful shutdown.
 */
/**
 * Result of a diagnostics query, distinguishing "no issues" from "timed out".
 */
export interface DiagnosticsResult {
  diagnostics: Diagnostic[];
  timedOut: boolean;
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

export class LspManager {
  private readonly clients = new Map<ClientKey, LspClient>();
  private readonly brokenServers = new Set<ClientKey>();
  private readonly brokenServerErrors = new Map<ClientKey, string>();
  private readonly startingClients = new Map<
    ClientKey,
    Promise<LspClient | null>
  >();
  private readonly diagnosticCache = new Map<string, Diagnostic[]>();
  private readonly fileVersions = new Map<string, number>();
  private readonly registry: LspServerRegistry;
  private readonly settings: LspSettings;

  /** Track how many server processes are alive for maxServers enforcement. */
  private activeServerCount = 0;

  /**
   * Adaptive timeout per server key: starts high for cold start, halves on
   * each consecutive timeout, resets to the configured value on success.
   */
  private readonly serverTimeouts = new Map<ClientKey, number>();
  private static readonly MIN_TIMEOUT = 1000;
  private static readonly COLD_START_MULTIPLIER = 3;

  constructor(settings?: Partial<LspSettings>) {
    this.settings = { ...DEFAULT_LSP_SETTINGS, ...settings };
    this.registry = new LspServerRegistry(this.settings.servers);
  }

  /**
   * Notify the LSP server that a file was read. This keeps the server's
   * in-memory state warm so that subsequent queries are fast.
   *
   * Fire-and-forget — never throws or blocks.
   */
  async touchFile(filePath: string, content?: string): Promise<void> {
    try {
      const client = await this.getOrCreateClient(filePath);
      if (!client) return;

      const uri = filePathToUri(filePath);
      const languageId = this.registry.getLanguageId(filePath);
      if (!languageId) return;

      const version = (this.fileVersions.get(uri) ?? 0) + 1;
      this.fileVersions.set(uri, version);

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
   * Get diagnostics for a file. If the file hasn't been opened yet, opens it
   * first. Waits up to `diagnosticTimeout` for the server to publish
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

      const client = await this.getOrCreateClient(filePath, signal);
      if (!client) return { diagnostics: [], timedOut: false };

      const uri = filePathToUri(filePath);
      const languageId = this.registry.getLanguageId(filePath);
      if (!languageId) return { diagnostics: [], timedOut: false };

      // Per-server adaptive timeout.
      const projectRoot = await this.findProjectRoot(filePath, serverDef);
      const serverKey = `${serverDef.id}:${projectRoot}`;
      const timeout = this.getTimeout(serverKey);

      // Start listening BEFORE sending the document to avoid a race where
      // the server publishes diagnostics before our listener is attached.
      const diagnosticsPromise = client.waitForDiagnostics(
        uri,
        timeout,
        signal,
      );

      // Open or update the document.
      const version = (this.fileVersions.get(uri) ?? 0) + 1;
      this.fileVersions.set(uri, version);

      if (version === 1) {
        client.didOpen(uri, languageId, content);
      } else {
        client.didChange(uri, version, content);
      }

      // Wait for the server to publish diagnostics.
      // null = timeout (server didn't respond), [] = server said "clean".
      const result = await diagnosticsPromise;
      const timedOut = result === null;
      const diagnostics = result ?? [];

      // Adaptive timeout: on success (server responded, even with []),
      // settle to configured value. On timeout, halve for next attempt.
      this.updateTimeout(serverKey, timedOut);

      // Cache for later diff comparisons.
      this.diagnosticCache.set(uri, diagnostics);

      return { diagnostics, timedOut };
    } catch (e) {
      logger.debug(`LSP getDiagnostics error: ${e}`);
      return { diagnostics: [], timedOut: false };
    }
  }

  /**
   * Get cached diagnostics from the most recent getDiagnostics() call for a
   * file. Used for computing diagnostic diffs.
   */
  getCachedDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnosticCache.get(filePathToUri(filePath)) ?? [];
  }

  /**
   * Request hover info at a position.
   */
  async getHover(
    filePath: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Hover | null> {
    try {
      const client = await this.getOrCreateClient(filePath, signal);
      if (!client) return null;
      return await client.hover(
        filePathToUri(filePath),
        line,
        character,
        signal,
      );
    } catch {
      return null;
    }
  }

  /**
   * Request go-to-definition.
   */
  async getDefinition(
    filePath: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Location[]> {
    try {
      const client = await this.getOrCreateClient(filePath, signal);
      if (!client) return [];
      const result = await client.definition(
        filePathToUri(filePath),
        line,
        character,
        signal,
      );
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    } catch {
      return [];
    }
  }

  /**
   * Request all references to a symbol.
   */
  async getReferences(
    filePath: string,
    line: number,
    character: number,
    signal?: AbortSignal,
  ): Promise<Location[]> {
    try {
      const client = await this.getOrCreateClient(filePath, signal);
      if (!client) return [];
      return (
        (await client.references(
          filePathToUri(filePath),
          line,
          character,
          signal,
        )) ?? []
      );
    } catch {
      return [];
    }
  }

  /**
   * Request document symbols.
   */
  async getDocumentSymbols(
    filePath: string,
    signal?: AbortSignal,
  ): Promise<DocumentSymbol[] | SymbolInformation[]> {
    try {
      const client = await this.getOrCreateClient(filePath, signal);
      if (!client) return [];
      return (
        (await client.documentSymbols(filePathToUri(filePath), signal)) ?? []
      );
    } catch {
      return [];
    }
  }

  /**
   * Search workspace symbols.
   */
  async getWorkspaceSymbols(
    query: string,
    filePath: string,
    signal?: AbortSignal,
  ): Promise<SymbolInformation[]> {
    try {
      const client = await this.getOrCreateClient(filePath, signal);
      if (!client) return [];
      return (await client.workspaceSymbols(query, signal)) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Check whether LSP is available for the given file type.
   */
  hasServerFor(filePath: string): boolean {
    return this.registry.getServerForFile(filePath) !== undefined;
  }

  /**
   * Get status information for all known servers (running, failed, and
   * available but not yet started). Used by `/lsp status`.
   */
  getStatus(): LspServerStatus[] {
    const statuses: LspServerStatus[] = [];

    for (const serverDef of this.registry.getAllServers()) {
      // Find any running or broken instances for this server type.
      let found = false;

      for (const [key, client] of this.clients) {
        if (!key.startsWith(`${serverDef.id}:`)) continue;
        found = true;
        const projectRoot = key.substring(serverDef.id.length + 1);
        const filesForRoot = Array.from(this.fileVersions.keys()).filter(
          (uri) =>
            uri.includes(encodeURIComponent(projectRoot)) ||
            uri.includes(projectRoot.replace(/\\/g, '/')),
        );
        const diagsForRoot = Array.from(this.diagnosticCache.entries())
          .filter(([uri]) => filesForRoot.some((f) => uri === f))
          .reduce((sum, [, diags]) => sum + diags.length, 0);

        statuses.push({
          id: serverDef.id,
          state: client.isAlive ? 'running' : 'stopped',
          projectRoot,
          filesTracked: filesForRoot.length,
          diagnosticsCached: diagsForRoot,
          command: serverDef.command,
          args: serverDef.args,
          languageIds: serverDef.languageIds,
        });
      }

      // Check broken servers.
      for (const key of this.brokenServers) {
        if (!key.startsWith(`${serverDef.id}:`)) continue;
        if (this.clients.has(key)) continue; // Already counted above.
        found = true;
        const projectRoot = key.substring(serverDef.id.length + 1);
        statuses.push({
          id: serverDef.id,
          state: 'failed',
          projectRoot,
          error: this.brokenServerErrors.get(key),
          filesTracked: 0,
          diagnosticsCached: 0,
          command: serverDef.command,
          args: serverDef.args,
          languageIds: serverDef.languageIds,
        });
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

  /**
   * Get the current settings (for display in `/lsp status`).
   */
  getSettings(): LspSettings {
    return { ...this.settings };
  }

  /**
   * Shut down all active language server processes.
   */
  async shutdown(): Promise<void> {
    const shutdowns = Array.from(this.clients.values()).map((client) =>
      client.shutdown().catch(() => {}),
    );
    await Promise.allSettled(shutdowns);
    this.clients.clear();
    this.startingClients.clear();
    this.brokenServers.clear();
    this.brokenServerErrors.clear();
    this.diagnosticCache.clear();
    this.fileVersions.clear();
    this.serverTimeouts.clear();
    this.activeServerCount = 0;
  }

  // -----------------------------------------------------------------------
  // Adaptive timeout
  // -----------------------------------------------------------------------

  /**
   * Get the current timeout for a server. First call for a server gets a
   * generous cold-start timeout (configured × 3).
   */
  private getTimeout(serverKey: ClientKey): number {
    const existing = this.serverTimeouts.get(serverKey);
    if (existing !== undefined) return existing;
    const coldStart =
      this.settings.diagnosticTimeout * LspManager.COLD_START_MULTIPLIER;
    this.serverTimeouts.set(serverKey, coldStart);
    return coldStart;
  }

  /**
   * Update the timeout for a server based on whether the last call timed out.
   * Success → reset to configured value. Timeout → halve (floor at 1s).
   */
  private updateTimeout(serverKey: ClientKey, timedOut: boolean): void {
    if (!timedOut) {
      this.serverTimeouts.set(serverKey, this.settings.diagnosticTimeout);
    } else {
      const current =
        this.serverTimeouts.get(serverKey) ?? this.settings.diagnosticTimeout;
      this.serverTimeouts.set(
        serverKey,
        Math.max(LspManager.MIN_TIMEOUT, Math.floor(current / 2)),
      );
    }
  }

  // -----------------------------------------------------------------------
  // Client lifecycle
  // -----------------------------------------------------------------------

  /**
   * Get or create an LspClient for the given file. Returns null if:
   * - No server definition exists for this file type
   * - The server previously failed to start (broken)
   * - The maximum number of servers is reached
   * - The server binary is not found
   */
  private async getOrCreateClient(
    filePath: string,
    signal?: AbortSignal,
  ): Promise<LspClient | null> {
    const serverDef = this.registry.getServerForFile(filePath);
    if (!serverDef) return null;

    const projectRoot = await this.findProjectRoot(filePath, serverDef);
    const key = `${serverDef.id}:${projectRoot}`;

    // Already running?
    const existing = this.clients.get(key);
    if (existing?.isAlive) return existing;

    // Known broken?
    if (this.brokenServers.has(key)) return null;

    // Already starting? Wait for it.
    const starting = this.startingClients.get(key);
    if (starting) return starting;

    // Start a new client.
    const promise = this.startClient(key, serverDef, projectRoot, signal);
    this.startingClients.set(key, promise);

    try {
      return await promise;
    } finally {
      this.startingClients.delete(key);
    }
  }

  private async startClient(
    key: ClientKey,
    serverDef: LspServerDefinition,
    projectRoot: string,
    signal?: AbortSignal,
  ): Promise<LspClient | null> {
    // Enforce max server count.
    if (this.activeServerCount >= this.settings.maxServers) {
      logger.debug(
        `LSP: max servers (${this.settings.maxServers}) reached, skipping ${serverDef.id}`,
      );
      return null;
    }

    const rootUri = pathToFileURL(projectRoot).href;
    const client = new LspClient(serverDef, rootUri);

    client.on('exit', () => {
      this.clients.delete(key);
      this.activeServerCount = Math.max(0, this.activeServerCount - 1);
    });

    client.on('error', (err: Error) => {
      this.clients.delete(key);
      this.brokenServers.add(key);
      this.brokenServerErrors.set(key, err.message);
      this.activeServerCount = Math.max(0, this.activeServerCount - 1);
    });

    try {
      await client.start(signal);
      this.clients.set(key, client);
      this.activeServerCount++;
      logger.debug(`LSP: started ${serverDef.id} server for ${projectRoot}`);
      return client;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.debug(`LSP: failed to start ${serverDef.id}: ${errMsg}`);
      this.brokenServers.add(key);
      this.brokenServerErrors.set(key, errMsg);
      return null;
    }
  }

  /**
   * Walk up the directory tree from filePath looking for a root marker file.
   * Falls back to the file's parent directory.
   */
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

    // Fallback: use the file's directory.
    return path.dirname(path.resolve(filePath));
  }
}

/**
 * Convert a file system path to a file:// URI.
 */
function filePathToUri(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href;
}
