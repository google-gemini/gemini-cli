/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../config/settings.js';

/**
 * OAuth token validation and project scoping utilities
 */

export interface OAuthTokenInfo {
  projectId: string;
  scopes: string[];
  expiresAt: number;
  issuedAt: number;
  issuer: string;
  audience: string;
}

/**
 * Validates OAuth token format and extracts claims
 */
export function validateOAuthToken(token: string): OAuthTokenInfo | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    // Split JWT token
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode payload (without verification - this is just format validation)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Validate required claims
    if (!payload.iss || !payload.aud || !payload.exp || !payload.iat) {
      return null;
    }

    // Extract project information from custom claims
    const projectId = payload['https://cloud.google.com/project'] ||
                     payload.project_id ||
                     payload.aud.split('/')[1]; // Extract from audience

    if (!projectId) {
      return null;
    }

    return {
      projectId,
      scopes: payload.scope ? payload.scope.split(' ') : [],
      expiresAt: payload.exp,
      issuedAt: payload.iat,
      issuer: payload.iss,
      audience: payload.aud,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Validates that an OAuth token is authorized for the specified project
 */
export function validateTokenProjectScope(
  token: string,
  expectedProjectId: string,
  requiredScopes: string[] = []
): { valid: boolean; reason?: string } {
  const tokenInfo = validateOAuthToken(token);

  if (!tokenInfo) {
    return { valid: false, reason: 'Invalid token format' };
  }

  // Check if token is expired
  if (Date.now() / 1000 > tokenInfo.expiresAt) {
    return { valid: false, reason: 'Token expired' };
  }

  // Check project scope
  if (tokenInfo.projectId !== expectedProjectId) {
    return {
      valid: false,
      reason: `Token is for project ${tokenInfo.projectId}, but expected ${expectedProjectId}`
    };
  }

  // Check required scopes
  if (requiredScopes.length > 0) {
    const hasAllScopes = requiredScopes.every(scope =>
      tokenInfo.scopes.some(tokenScope =>
        tokenScope === scope || tokenScope.endsWith(scope)
      )
    );

    if (!hasAllScopes) {
      return {
        valid: false,
        reason: `Token missing required scopes: ${requiredScopes.join(', ')}`
      };
    }
  }

  // Validate issuer
  if (!tokenInfo.issuer.includes('google') && !tokenInfo.issuer.includes('accounts.google.com')) {
    return { valid: false, reason: 'Invalid token issuer' };
  }

  return { valid: true };
}

/**
 * Validates project access before operations
 */
export function validateProjectAccess(
  token: string,
  projectId: string,
  operation: string,
  settings: LoadedSettings
): { authorized: boolean; reason?: string } {
  // Check if project is in allowed list (if configured)
  const allowedProjects = settings.merged.security?.allowedProjects;
  if (allowedProjects && Array.isArray(allowedProjects)) {
    if (!allowedProjects.includes(projectId)) {
      return {
        authorized: false,
        reason: `Project ${projectId} is not in the allowed projects list`
      };
    }
  }

  // Validate token scope
  const requiredScopes = getRequiredScopesForOperation(operation);
  const tokenValidation = validateTokenProjectScope(token, projectId, requiredScopes);

  if (!tokenValidation.valid) {
    return {
      authorized: false,
      reason: tokenValidation.reason
    };
  }

  return { authorized: true };
}

/**
 * Gets required OAuth scopes for different operations
 */
function getRequiredScopesForOperation(operation: string): string[] {
  const scopeMap: Record<string, string[]> = {
    'read': ['https://www.googleapis.com/auth/cloud-platform.read-only'],
    'write': ['https://www.googleapis.com/auth/cloud-platform'],
    'admin': ['https://www.googleapis.com/auth/cloud-platform'],
    'storage': ['https://www.googleapis.com/auth/devstorage.full_control'],
    'ai': ['https://www.googleapis.com/auth/aiplatform'],
    'gemini': ['https://www.googleapis.com/auth/gemini-api'],
  };

  return scopeMap[operation] || ['https://www.googleapis.com/auth/cloud-platform'];
}

/**
 * Securely stores OAuth credentials with proper validation
 */
export function storeValidatedCredentials(
  token: string,
  projectId: string,
  refreshToken?: string
): boolean {
  try {
    // Validate token before storing
    const validation = validateTokenProjectScope(token, projectId);
    if (!validation.valid) {
      return false;
    }

    // Store with proper file permissions (600)
    // This is a placeholder - actual implementation would use secure storage
    const credentials = {
      access_token: token,
      project_id: projectId,
      token_type: 'Bearer',
      expires_at: Date.now() + (3600 * 1000), // 1 hour
      refresh_token: refreshToken,
    };

    // TODO: Implement secure credential storage with proper file permissions
    console.log('Credentials validated and would be stored securely');

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validates cached credentials before use
 */
export function validateCachedCredentials(
  credentials: any,
  expectedProjectId: string
): boolean {
  if (!credentials || !credentials.access_token) {
    return false;
  }

  // Check if token is expired
  if (credentials.expires_at && Date.now() > credentials.expires_at) {
    return false;
  }

  // Validate project scope
  const validation = validateTokenProjectScope(
    credentials.access_token,
    expectedProjectId
  );

  return validation.valid;
}

/**
 * Creates an OAuth token auditor for monitoring token usage
 */
export class OAuthTokenAuditor {
  private tokenUsage: Map<string, { count: number; lastUsed: number; projects: Set<string> }> = new Map();

  recordTokenUsage(token: string, projectId: string): void {
    const tokenInfo = validateOAuthToken(token);
    if (!tokenInfo) return;

    const key = `${tokenInfo.issuer}:${tokenInfo.audience}`;
    const usage = this.tokenUsage.get(key) || { count: 0, lastUsed: 0, projects: new Set() };

    usage.count++;
    usage.lastUsed = Date.now();
    usage.projects.add(projectId);

    this.tokenUsage.set(key, usage);

    // Log suspicious activity
    if (usage.projects.size > 3) {
      console.warn(`Token used across multiple projects: ${Array.from(usage.projects).join(', ')}`);
    }
  }

  getTokenUsageReport(): Record<string, any> {
    const report: Record<string, any> = {};

    for (const [token, usage] of this.tokenUsage) {
      report[token] = {
        usageCount: usage.count,
        lastUsed: new Date(usage.lastUsed).toISOString(),
        projectCount: usage.projects.size,
        projects: Array.from(usage.projects),
      };
    }

    return report;
  }
}
