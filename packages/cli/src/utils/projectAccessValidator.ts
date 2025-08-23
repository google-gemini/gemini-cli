/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';
import { getOauthClient, clearCachedCredentialFile, clearOauthClientCache } from '@google/gemini-cli-core';
import { AuthType, Config } from '@google/gemini-cli-core';

/**
 * Validates if the current user has access to the specified Google Cloud project.
 * This prevents authentication bypass via project ID manipulation.
 */
export async function validateProjectAccess(
  projectId: string,
  client: OAuth2Client
): Promise<boolean> {
  if (!projectId) {
    console.warn('No project ID specified for validation');
    return false;
  }

  try {
    const { token } = await client.getAccessToken();
    if (!token) {
      console.warn('No access token available for project validation');
      return false;
    }

    // Validate project access by calling Cloud Resource Manager API
    const response = await fetch(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      console.warn(`No access to project: ${projectId} (${response.status})`);
      return false;
    }

    const project = await response.json();

    // Verify project exists and is active
    if (!project || project.lifecycleState !== 'ACTIVE') {
      console.warn(`Project ${projectId} is not active or does not exist`);
      return false;
    }

    console.log(`✓ Validated access to project: ${projectId}`);
    return true;

  } catch (error) {
    console.error(`Error validating project access for ${projectId}:`, error);
    return false;
  }
}

/**
 * Validates project access for the current authentication context.
 * This should be called on every CLI startup to prevent project ID manipulation.
 */
export async function validateCurrentProjectAccess(
  authType: AuthType,
  config: Config
): Promise<boolean> {
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];

  if (!projectId) {
    // No project specified, which is valid for some auth types
    return true;
  }

  try {
    const client = await getOauthClient(authType, config);
    return await validateProjectAccess(projectId, client);
  } catch (error) {
    console.error('Error during project access validation:', error);
    return false;
  }
}

/**
 * Forces re-authentication by clearing cached credentials.
 * This should be called when project access validation fails.
 */
export async function forceReauthentication(): Promise<void> {
  try {
    // Import the clear function from oauth2
    const { clearCachedCredentialFile } = await import('../../core/src/code_assist/oauth2.js');
    await clearCachedCredentialFile();

    console.error('🔒 Authentication required due to project access validation failure.');
    console.error('Please re-authenticate to continue.');
    console.error('');
    console.error('Run the CLI again to start the authentication process.');

    process.exit(1);
  } catch (error) {
    console.error('Error during forced re-authentication:', error);
    process.exit(1);
  }
}

/**
 * Enhanced authentication flow that includes project access validation.
 * This should replace the standard authentication flow to prevent bypass.
 */
export async function authenticateWithProjectValidation(
  authType: AuthType,
  config: Config
): Promise<OAuth2Client> {
  // Get the OAuth client (this handles the standard authentication)
  const client = await getOauthClient(authType, config);

  // Validate project access after authentication
  const hasProjectAccess = await validateCurrentProjectAccess(authType, config);

  if (!hasProjectAccess) {
    console.error('❌ Authentication failed: No access to specified project');
    await forceReauthentication();
    // The function won't reach here due to process.exit(1)
    throw new Error('Authentication failed');
  }

  return client;
}

// Export types for testing
export interface ProjectValidationResult {
  hasAccess: boolean;
  projectId: string | null;
  error?: string;
}
