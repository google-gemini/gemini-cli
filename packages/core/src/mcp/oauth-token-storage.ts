/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDefaultTokenStorage } from './token-storage/index.js';
import type {
  MCPOAuthCredentials,
  MCPOAuthToken,
} from './token-storage/types.js';

export type { MCPOAuthToken, MCPOAuthCredentials };

/**
 * Class for managing MCP OAuth token storage and retrieval.
 * Now uses secure keychain storage with automatic fallback to encrypted file storage.
 */
export class MCPOAuthTokenStorage {
  /**
   * Load all stored MCP OAuth tokens.
   *
   * @returns A map of server names to credentials
   */
  static async loadTokens(): Promise<Map<string, MCPOAuthCredentials>> {
    try {
      const storage = getDefaultTokenStorage();
      return await storage.getAllCredentials();
    } catch (error) {
      console.error('Failed to load MCP OAuth tokens:', error);
      return new Map();
    }
  }

  /**
   * Save a token for a specific MCP server.
   *
   * @param serverName The name of the MCP server
   * @param token The OAuth token to save
   * @param clientId Optional client ID used for this token
   * @param tokenUrl Optional token URL used for this token
   * @param mcpServerUrl Optional MCP server URL
   */
  static async saveToken(
    serverName: string,
    token: MCPOAuthToken,
    clientId?: string,
    tokenUrl?: string,
    mcpServerUrl?: string,
  ): Promise<void> {
    const credential: MCPOAuthCredentials = {
      serverName,
      token,
      clientId,
      tokenUrl,
      mcpServerUrl,
      updatedAt: Date.now(),
    };

    const storage = getDefaultTokenStorage();
    await storage.setCredentials(credential);
  }

  /**
   * Get a token for a specific MCP server.
   *
   * @param serverName The name of the MCP server
   * @returns The stored credentials or null if not found
   */
  static async getToken(
    serverName: string,
  ): Promise<MCPOAuthCredentials | null> {
    try {
      const storage = getDefaultTokenStorage();
      return await storage.getCredentials(serverName);
    } catch (error) {
      console.error(`Failed to get token for ${serverName}:`, error);
      return null;
    }
  }

  /**
   * Remove a token for a specific MCP server.
   *
   * @param serverName The name of the MCP server
   */
  static async removeToken(serverName: string): Promise<void> {
    try {
      const storage = getDefaultTokenStorage();
      await storage.deleteCredentials(serverName);
    } catch (error) {
      console.error(`Failed to remove token for ${serverName}:`, error);
    }
  }

  /**
   * Check if a token is expired.
   *
   * @param token The token to check
   * @returns True if the token is expired
   */
  static isTokenExpired(token: MCPOAuthToken): boolean {
    if (!token.expiresAt) {
      return false;
    }

    const bufferMs = 5 * 60 * 1000;
    return Date.now() + bufferMs >= token.expiresAt;
  }

  /**
   * Clear all stored MCP OAuth tokens.
   */
  static async clearAllTokens(): Promise<void> {
    try {
      const storage = getDefaultTokenStorage();
      await storage.clearAll();
    } catch (error) {
      console.error('Failed to clear MCP OAuth tokens:', error);
    }
  }
}
