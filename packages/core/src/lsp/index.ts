/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Manager
 *
 * Central orchestration layer for LSP support. Manages multiple LSP clients,
 * routes requests to appropriate servers, and provides a simple public API.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createClient, extractHoverContent, type LSPClient } from './client.js';
import { ALL_SERVERS, type ServerInfo } from './server.js';
import { isLanguageSupported } from './language.js';
import type { Diagnostic, Hover } from './types.js';
import { SEVERITY_NAMES } from './types.js';

// Re-export types for consumers
export { type Diagnostic, type Hover, SEVERITY_NAMES } from './types.js';
export { getLanguageId, isLanguageSupported } from './language.js';
export { extractHoverContent } from './client.js';

/**
 * Configuration for the LSP Manager
 */
export interface LSPManagerConfig {
  /** Disable all LSP functionality */
  disabled?: boolean;
  /** Custom server configurations (for future extension) */
  servers?: Record<string, unknown>;
}

/**
 * Result of getting diagnostics
 */
export interface DiagnosticsResult {
  /** The file path */
  filePath: string;
  /** Array of diagnostics */
  diagnostics: Diagnostic[];
  /** The server that provided the diagnostics */
  serverID: string;
}

/**
 * Central manager for LSP functionality.
 * Handles client lifecycle, caching, and request routing.
 */
class LSPManager {
  /** Active clients keyed by "serverID:root" */
  private clients = new Map<string, LSPClient>();

  /** Pending client spawns to avoid duplicate spawning */
  private pending = new Map<string, Promise<LSPClient | undefined>>();

  /** Servers that have failed to spawn (to avoid retrying) */
  private brokenServers = new Set<string>();

  /** Files that have been touched (notified to LSP) */
  private touchedFiles = new Set<string>();

  /** Whether LSP is disabled globally */
  private disabled = false;

  /** Whether the manager has been initialized */
  private initialized = false;

  /**
   * Initialize the LSP manager.
   *
   * @param config - Configuration options
   */
  async init(config: LSPManagerConfig = {}): Promise<void> {
    this.disabled = config.disabled ?? false;
    this.initialized = true;
  }

  /**
   * Check if LSP is enabled.
   */
  isEnabled(): boolean {
    return this.initialized && !this.disabled;
  }

  /**
   * Notify LSP servers about a file being opened or changed.
   * This is the primary way to keep LSP servers in sync with file content.
   *
   * @param filePath - Absolute path to the file
   * @param forceRefresh - If true, re-read the file even if already touched
   * @param signal - Optional AbortSignal for cancellation
   */
  async touchFile(
    filePath: string,
    forceRefresh = false,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    if (signal?.aborted) return;

    const normalizedPath = path.resolve(filePath);

    // Check if language is supported
    if (!isLanguageSupported(normalizedPath)) {
      return;
    }

    // Get clients for this file
    const clients = await this.getClientsForFile(normalizedPath);
    if (clients.length === 0) {
      return;
    }

    if (signal?.aborted) return;

    // Read file content
    let content: string;
    try {
      content = await fs.readFile(normalizedPath, 'utf-8');
    } catch {
      // File doesn't exist or can't be read
      return;
    }

    if (signal?.aborted) return;

    // Notify each client
    const isNewFile = !this.touchedFiles.has(normalizedPath);
    this.touchedFiles.add(normalizedPath);

    for (const client of clients) {
      if (signal?.aborted) break;

      try {
        if (isNewFile || forceRefresh) {
          await client.notifyFileOpened(normalizedPath, content);
        } else {
          await client.notifyFileChanged(normalizedPath, content);
        }
      } catch (_error) {
        // Client may have died - remove it
        const key = `${client.serverID}:${client.root}`;
        this.clients.delete(key);
      }
    }
  }

  /**
   * Touch a file with provided content (avoids re-reading).
   *
   * @param filePath - Absolute path to the file
   * @param content - The file content
   * @param signal - Optional AbortSignal for cancellation
   */
  async touchFileWithContent(
    filePath: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    if (signal?.aborted) return;

    const normalizedPath = path.resolve(filePath);

    if (!isLanguageSupported(normalizedPath)) {
      return;
    }

    const clients = await this.getClientsForFile(normalizedPath);
    if (clients.length === 0) {
      return;
    }

    if (signal?.aborted) return;

    const isNewFile = !this.touchedFiles.has(normalizedPath);
    this.touchedFiles.add(normalizedPath);

    for (const client of clients) {
      if (signal?.aborted) break;

      try {
        if (isNewFile) {
          await client.notifyFileOpened(normalizedPath, content);
        } else {
          await client.notifyFileChanged(normalizedPath, content);
        }
      } catch (_error) {
        const key = `${client.serverID}:${client.root}`;
        this.clients.delete(key);
      }
    }
  }

  /**
   * Get diagnostics for a file.
   *
   * @param filePath - Absolute path to the file
   * @param options - Optional settings
   * @param options.skipTouch - Skip touching the file (use when content was already synced)
   * @param options.signal - AbortSignal for cancellation
   * @returns Array of diagnostics from all applicable servers
   */
  async getDiagnostics(
    filePath: string,
    options?: { skipTouch?: boolean; signal?: AbortSignal },
  ): Promise<Diagnostic[]> {
    if (!this.isEnabled()) return [];
    if (options?.signal?.aborted) return [];

    const normalizedPath = path.resolve(filePath);

    // Touch file to sync content unless already synced
    if (!options?.skipTouch) {
      await this.touchFile(normalizedPath, true, options?.signal);
    }

    if (options?.signal?.aborted) return [];

    const clients = await this.getClientsForFile(normalizedPath);
    const allDiagnostics: Diagnostic[] = [];

    for (const client of clients) {
      if (options?.signal?.aborted) break;

      try {
        const diagnostics = await client.waitForDiagnostics(
          normalizedPath,
          undefined,
          options?.signal,
        );
        allDiagnostics.push(...diagnostics);
      } catch (_error) {
        // Client may have died
        const key = `${client.serverID}:${client.root}`;
        this.clients.delete(key);
      }
    }

    return allDiagnostics;
  }

  /**
   * Get hover information at a specific position.
   *
   * @param filePath - Absolute path to the file
   * @param line - Line number (0-indexed)
   * @param character - Character position (0-indexed)
   * @returns Hover information or null if not available
   */
  async getHover(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Hover | null> {
    if (!this.isEnabled()) return null;

    const normalizedPath = path.resolve(filePath);

    // Ensure file is touched first
    await this.touchFile(normalizedPath);

    const clients = await this.getClientsForFile(normalizedPath);

    for (const client of clients) {
      try {
        const hover = await client.requestHover(
          normalizedPath,
          line,
          character,
        );
        if (hover) {
          return hover;
        }
      } catch (_error) {
        const key = `${client.serverID}:${client.root}`;
        this.clients.delete(key);
      }
    }

    return null;
  }

  /**
   * Get hover content as a string.
   *
   * @param filePath - Absolute path to the file
   * @param line - Line number (0-indexed)
   * @param character - Character position (0-indexed)
   * @returns Hover content string or null
   */
  async getHoverContent(
    filePath: string,
    line: number,
    character: number,
  ): Promise<string | null> {
    const hover = await this.getHover(filePath, line, character);
    return extractHoverContent(hover);
  }

  /**
   * Shutdown all active clients.
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Array<Promise<void>> = [];

    for (const client of this.clients.values()) {
      shutdownPromises.push(client.shutdown());
    }

    await Promise.allSettled(shutdownPromises);
    this.clients.clear();
    this.pending.clear();
    this.touchedFiles.clear();
    this.brokenServers.clear();
  }

  /**
   * Get the number of active clients.
   */
  getActiveClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients that can handle a file.
   */
  private async getClientsForFile(filePath: string): Promise<LSPClient[]> {
    const ext = path.extname(filePath);
    const results: LSPClient[] = [];

    for (const server of ALL_SERVERS) {
      if (!server.extensions.includes(ext)) {
        continue;
      }

      // Check if this server has failed before
      if (this.brokenServers.has(server.id)) {
        continue;
      }

      // Find project root
      const root = await server.findRoot(filePath);
      if (!root) {
        continue;
      }

      const key = `${server.id}:${root}`;

      // Return cached client
      if (this.clients.has(key)) {
        results.push(this.clients.get(key)!);
        continue;
      }

      // Await pending spawn
      if (this.pending.has(key)) {
        const client = await this.pending.get(key);
        if (client) {
          results.push(client);
        }
        continue;
      }

      // Spawn new client
      const spawnPromise = this.spawnClient(server, root, key);
      this.pending.set(key, spawnPromise);

      try {
        const client = await spawnPromise;
        if (client) {
          this.clients.set(key, client);
          results.push(client);
        }
      } finally {
        this.pending.delete(key);
      }
    }

    return results;
  }

  /**
   * Spawn a new LSP client.
   */
  private async spawnClient(
    server: ServerInfo,
    root: string,
    _key: string,
  ): Promise<LSPClient | undefined> {
    try {
      const handle = await server.spawn(root);
      if (!handle) {
        // Server not installed
        return undefined;
      }

      return await createClient(server.id, handle, root);
    } catch (_error) {
      // Mark server as broken to avoid repeated failures
      this.brokenServers.add(server.id);
      console.error(`Failed to spawn LSP server ${server.id}:`, error);
      return undefined;
    }
  }
}

/**
 * Singleton LSP manager instance.
 * Use this for all LSP operations.
 */
export const lspManager = new LSPManager();

/**
 * Format diagnostics for display.
 *
 * @param diagnostics - Array of diagnostics
 * @param filePath - Optional file path for context
 * @returns Formatted string representation
 */
export function formatDiagnostics(
  diagnostics: Diagnostic[],
  filePath?: string,
): string {
  if (diagnostics.length === 0) {
    return 'No diagnostics found.';
  }

  const lines = diagnostics.map((d) => {
    const severity = SEVERITY_NAMES[d.severity ?? 1] ?? 'ERROR';
    const location = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
    const prefix = filePath ? `${path.basename(filePath)}:` : '';
    return `${severity} [${prefix}${location}]: ${d.message}`;
  });

  return lines.join('\n');
}

/**
 * Options for collecting diagnostics for tool output.
 */
export interface CollectDiagnosticsOptions {
  /** Maximum number of diagnostics to include (default: 20) */
  maxDiagnostics?: number;
  /** Severity levels to include (default: [1, 2] = ERROR, WARN) */
  severityFilter?: number[];
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Collect diagnostics for a file after a write/edit operation.
 * Returns a formatted string suitable for injection into tool output,
 * or null if no diagnostics found or LSP is disabled.
 *
 * This is designed to be called after file write/edit operations
 * to automatically surface compiler errors to the AI.
 *
 * @param filePath - Absolute path to the file
 * @param content - The file content (passed to avoid re-reading)
 * @param options - Options for filtering and limiting diagnostics
 * @returns Formatted diagnostics block or null
 */
export async function collectDiagnosticsForOutput(
  filePath: string,
  content: string,
  options?: CollectDiagnosticsOptions,
): Promise<string | null> {
  if (!lspManager.isEnabled()) return null;
  if (options?.signal?.aborted) return null;

  const { maxDiagnostics = 20, severityFilter = [1, 2] } = options ?? {};

  try {
    // Sync file content with LSP, then get diagnostics without re-reading from disk
    await lspManager.touchFileWithContent(filePath, content, options?.signal);
    const diagnostics = await lspManager.getDiagnostics(filePath, {
      skipTouch: true,
      signal: options?.signal,
    });

    // Filter by severity and limit count
    const filtered = diagnostics
      .filter((d) => severityFilter.includes(d.severity ?? 1))
      .slice(0, maxDiagnostics);

    if (filtered.length === 0) return null;

    // Format for AI consumption
    const formatted = formatDiagnostics(filtered, filePath);
    const totalCount = diagnostics.filter((d) =>
      severityFilter.includes(d.severity ?? 1),
    ).length;
    const suffix =
      totalCount > maxDiagnostics
        ? `\n... and ${totalCount - maxDiagnostics} more`
        : '';

    return `<lsp_diagnostics>
Please fix the following errors:
${formatted}${suffix}
</lsp_diagnostics>`;
  } catch {
    // LSP errors shouldn't break file operations
    return null;
  }
}
