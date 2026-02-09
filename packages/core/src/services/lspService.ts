/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from "../config/config.js";
import { LspClient } from "./lsp/lspClient.js";
import { pathToUri } from "../utils/uri.js";
import { debugLogger } from "../utils/debugLogger.js";

/**
 * Orchestrates multiple Language Servers to provide semantic code intelligence.
 */
export class LspService {
  private clients = new Map<string, LspClient>();

  constructor(private readonly config: Config) {}

  /**
   * Returns a running LspClient for the specified language.
   */
  async getClient(language: string): Promise<LspClient | undefined> {
    if (this.clients.has(language)) {
      return this.clients.get(language);
    }

    let client: LspClient | undefined;
    const projectRoot = this.config.getProjectRoot();
    const rootUri = pathToUri(projectRoot);

    if (language === "typescript" || language === "javascript") {
      // Use npx to ensure we can run it without global installation
      // In production, we might want a more robust resolution logic.
      client = new LspClient("npx", ["typescript-language-server", "--stdio"], rootUri);
    }

    if (client) {
      try {
        await client.start();
        this.clients.set(language, client);
        debugLogger.log(`[LspService] Started ${language} client`);
        return client;
      } catch (e) {
        debugLogger.error(`[LspService] Failed to start client for ${language}:`, e);
      }
    }

    return undefined;
  }

  /**
   * Finds references for a symbol at the given position.
   */
  async findReferences(filePath: string, line: number, character: number): Promise<any[]> {
    const client = await this.getClient("typescript");
    if (!client) return [];

    try {
      const result = await client.request("textDocument/references", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
        context: { includeDeclaration: true }
      });
      return result || [];
    } catch (e) {
      debugLogger.error(`[LspService] findReferences failed:`, e);
      return [];
    }
  }

  /**
   * Resolves the definition location for a symbol.
   */
  async goToDefinition(filePath: string, line: number, character: number): Promise<any> {
    const client = await this.getClient("typescript");
    if (!client) return null;

    try {
      return await client.request("textDocument/definition", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character }
      });
    } catch (e) {
      debugLogger.error(`[LspService] goToDefinition failed:`, e);
      return null;
    }
  }

  /**
   * Stops all running language servers.
   */
  dispose(): void {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
  }
}
