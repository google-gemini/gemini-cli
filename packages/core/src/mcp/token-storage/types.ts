/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MCPOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}

export interface MCPOAuthCredentials {
  serverName: string;
  token: MCPOAuthToken;
  clientId?: string;
  tokenUrl?: string;
  mcpServerUrl?: string;
  updatedAt: number;
}

export interface ITokenStorage {
  getCredentials(serverName: string): Promise<MCPOAuthCredentials | null>;
  setCredentials(credentials: MCPOAuthCredentials): Promise<void>;
  deleteCredentials(serverName: string): Promise<void>;
  listServers(): Promise<string[]>;
  getAllCredentials(): Promise<Map<string, MCPOAuthCredentials>>;
  clearAll(): Promise<void>;
}

export interface MigrationResult {
  success: boolean;
  migrated: number;
  total: number;
  errors?: string[];
}

export enum TokenStorageType {
  KEYCHAIN = 'keychain',
  FILE = 'file',
  ENCRYPTED_FILE = 'encrypted_file',
}

export interface TokenStorageConfig {
  type?: TokenStorageType;
  serviceName?: string;
  fallbackEnabled?: boolean;
  migrationEnabled?: boolean;
}
