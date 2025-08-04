/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Interface for MCP OAuth tokens.
 */
export interface MCPOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}

/**
 * Interface for stored MCP OAuth credentials.
 */
export interface MCPOAuthCredentials {
  serverName: string;
  token: MCPOAuthToken;
  clientId?: string;
  tokenUrl?: string;
  mcpServerUrl?: string;
  updatedAt: number;
}

/**
 * Class for managing MCP OAuth token storage and retrieval.
 */
export class MCPOAuthTokenStorage {
  private static readonly TOKEN_FILE = 'mcp-oauth-tokens.json';
  private static readonly CONFIG_DIR = '.gemini';

  /**
   * Get the path to the token storage file.
   *
   * @returns The full path to the token storage file
   */
  private static getTokenFilePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, this.CONFIG_DIR, this.TOKEN_FILE);
  }

  /**
   * Ensure the config directory exists.
   */
  private static async ensureConfigDir(): Promise<void> {
    const configDir = path.dirname(this.getTokenFilePath());
    await fs.mkdir(configDir, { recursive: true });
  }

  /**
   * Load all stored MCP OAuth tokens.
   *
   * @returns A map of server names to credentials
   */
  static async loadTokens(): Promise<Map<string, MCPOAuthCredentials>> {
    const tokenMap = new Map<string, MCPOAuthCredentials>();

    try {
      const tokenFile = this.getTokenFilePath();
      const data = await fs.readFile(tokenFile, 'utf-8');
      const tokens = JSON.parse(data) as MCPOAuthCredentials[];

      for (const credential of tokens) {
        tokenMap.set(credential.serverName, credential);
      }
    } catch (error) {
      // File doesn't exist or is invalid, return empty map
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(
          `Failed to load MCP OAuth tokens: ${getErrorMessage(error)}`,
        );
      }
    }

    return tokenMap;
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
    await this.ensureConfigDir();

    const tokens = await this.loadTokens();

    const credential: MCPOAuthCredentials = {
      serverName,
      token,
      clientId,
      tokenUrl,
      mcpServerUrl,
      updatedAt: Date.now(),
    };

    tokens.set(serverName, credential);

    const tokenArray = Array.from(tokens.values());
    const tokenFile = this.getTokenFilePath();

    try {
      await fs.writeFile(
        tokenFile,
        JSON.stringify(tokenArray, null, 2),
        { mode: 0o600 }, // Restrict file permissions
      );
    } catch (error) {
      console.error(
        `Failed to save MCP OAuth token: ${getErrorMessage(error)}`,
      );
      throw error;
    }
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
    const tokens = await this.loadTokens();
    return tokens.get(serverName) || null;
  }

  /**
   * Remove a token for a specific MCP server.
   *
   * @param serverName The name of the MCP server
   */
  static async removeToken(serverName: string): Promise<void> {
    const tokens = await this.loadTokens();

    if (tokens.delete(serverName)) {
      const tokenArray = Array.from(tokens.values());
      const tokenFile = this.getTokenFilePath();

      try {
        if (tokenArray.length === 0) {
          // Remove file if no tokens left
          await fs.unlink(tokenFile);
        } else {
          await fs.writeFile(tokenFile, JSON.stringify(tokenArray, null, 2), {
            mode: 0o600,
          });
        }
      } catch (error) {
        console.error(
          `Failed to remove MCP OAuth token: ${getErrorMessage(error)}`,
        );
      }
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
      return false; // No expiry, assume valid
    }

    // Add a 5-minute buffer to account for clock skew
    const bufferMs = 5 * 60 * 1000;
    return Date.now() + bufferMs >= token.expiresAt;
  }

  /**
   * Clear all stored MCP OAuth tokens.
   */
  static async clearAllTokens(): Promise<void> {
    try {
      const tokenFile = this.getTokenFilePath();
      await fs.unlink(tokenFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(
          `Failed to clear MCP OAuth tokens: ${getErrorMessage(error)}`,
        );
      }
    }
  }
}
