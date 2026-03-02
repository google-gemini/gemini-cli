/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { URL } from 'node:url';
import { openBrowserSecurely } from '../utils/secure-browser-launcher.js';
import type { OAuthToken } from './token-storage/types.js';
import { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import { getErrorMessage, FatalCancellationError } from '../utils/errors.js';
import { OAuthUtils, ResourceMismatchError } from './oauth-utils.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getConsentForOauth } from '../utils/authConsent.js';
import {
  generatePKCEParams,
  startCallbackServer,
  getPortFromUrl,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken as refreshAccessTokenShared,
  REDIRECT_PATH,
  type OAuthFlowConfig,
  type OAuthTokenResponse,
} from '../utils/oauth-flow.js';

// Re-export types that were moved to oauth-flow.ts for backward compatibility.
export type {
  OAuthAuthorizationResponse,
  OAuthTokenResponse,
} from '../utils/oauth-flow.js';

/**
 * OAuth configuration for an MCP server.
 */
export interface MCPOAuthConfig {
  enabled?: boolean; // Whether OAuth is enabled for this server
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  issuer?: string;
  tokenUrl?: string;
  scopes?: string[];
  audiences?: string[];
  redirectUri?: string;
  tokenParamName?: string; // For SSE connections, specifies the query parameter name for the token
  registrationUrl?: string;
}

/**
 * Dynamic client registration request (RFC 7591).
 */
export interface OAuthClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
}

/**
 * Dynamic client registration response (RFC 7591).
 */
export interface OAuthClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
}

/**
 * Provider for handling OAuth authentication for MCP servers.
 */
export class MCPOAuthProvider {
  private readonly tokenStorage: MCPOAuthTokenStorage;

  constructor(tokenStorage: MCPOAuthTokenStorage = new MCPOAuthTokenStorage()) {
    this.tokenStorage = tokenStorage;
  }

  /**
   * Register a client dynamically with the OAuth server.
   *
   * @param registrationUrl The client registration endpoint URL
   * @param config OAuth configuration
   * @param redirectPort The port to use for the redirect URI
   * @returns The registered client information
   */
  private async registerClient(
    registrationUrl: string,
    config: MCPOAuthConfig,
    redirectPort: number,
  ): Promise<OAuthClientRegistrationResponse> {
    const redirectUri =
      config.redirectUri || `http://localhost:${redirectPort}${REDIRECT_PATH}`;

    const registrationRequest: OAuthClientRegistrationRequest = {
      client_name: 'Gemini CLI MCP Client',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none', // Public client
      scope: config.scopes?.join(' ') || '',
    };

    const response = await fetch(registrationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registrationRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Client registration failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (await response.json()) as OAuthClientRegistrationResponse;
  }

  /**
   * Discover OAuth configuration from an MCP server URL.
   *
   * @param mcpServerUrl The MCP server URL
   * @returns OAuth configuration if discovered, null otherwise
   */
  private async discoverOAuthFromMCPServer(
    mcpServerUrl: string,
  ): Promise<MCPOAuthConfig | null> {
    // Use the full URL with path preserved for OAuth discovery
    return OAuthUtils.discoverOAuthConfig(mcpServerUrl);
  }

  private async discoverAuthServerMetadataForRegistration(
    issuer: string,
  ): Promise<{
    issuerUrl: string;
    metadata: NonNullable<
      Awaited<ReturnType<typeof OAuthUtils.discoverAuthorizationServerMetadata>>
    >;
  }> {
    const authUrl = new URL(issuer);

    // Preserve path components for issuers with path-based discovery (e.g., Keycloak)
    // Extract issuer by removing the OIDC protocol-specific path suffix
    // For example: http://localhost:8888/realms/my-realm/protocol/openid-connect/auth
    //           -> http://localhost:8888/realms/my-realm
    const oidcPatterns = [
      '/protocol/openid-connect/auth',
      '/protocol/openid-connect/authorize',
      '/oauth2/authorize',
      '/oauth/authorize',
      '/authorize',
    ];

    let pathname = authUrl.pathname.replace(/\/$/, ''); // Trim trailing slash
    for (const pattern of oidcPatterns) {
      if (pathname.endsWith(pattern)) {
        pathname = pathname.slice(0, -pattern.length);
        break;
      }
    }

    const issuerCandidates = new Set<string>();
    issuerCandidates.add(authUrl.origin);

    if (pathname) {
      issuerCandidates.add(`${authUrl.origin}${pathname}`);

      const versionSegmentPattern = /^v\d+(\.\d+)?$/i;
      const segments = pathname.split('/').filter(Boolean);
      const lastSegment = segments.at(-1);
      if (lastSegment && versionSegmentPattern.test(lastSegment)) {
        const withoutVersionPath = segments.slice(0, -1);
        if (withoutVersionPath.length) {
          issuerCandidates.add(
            `${authUrl.origin}/${withoutVersionPath.join('/')}`,
          );
        }
      }
    }

    const attemptedIssuers = Array.from(issuerCandidates);
    let selectedIssuer = attemptedIssuers[0];
    let discoveredMetadata: NonNullable<
      Awaited<ReturnType<typeof OAuthUtils.discoverAuthorizationServerMetadata>>
    > | null = null;

    for (const issuer of attemptedIssuers) {
      debugLogger.debug(`   Trying issuer URL: ${issuer}`);
      const metadata =
        await OAuthUtils.discoverAuthorizationServerMetadata(issuer);
      if (metadata) {
        selectedIssuer = issuer;
        discoveredMetadata = metadata;
        break;
      }
    }

    if (!discoveredMetadata) {
      throw new Error(
        `Failed to fetch authorization server metadata for client registration (attempted issuers: ${attemptedIssuers.join(', ')})`,
      );
    }

    debugLogger.debug(`   Selected issuer URL: ${selectedIssuer}`);
    return {
      issuerUrl: selectedIssuer,
      metadata: discoveredMetadata,
    };
  }

  /**
   * Build the OAuth resource parameter from an MCP server URL, if available.
   * Returns undefined if the URL is not provided or cannot be processed.
   */
  private buildResourceParam(mcpServerUrl?: string): string | undefined {
    if (!mcpServerUrl) return undefined;
    try {
      return OAuthUtils.buildResourceParameter(mcpServerUrl);
    } catch (error) {
      debugLogger.warn(
        `Could not add resource parameter: ${getErrorMessage(error)}`,
      );
      return undefined;
    }
  }

  /**
   * Refresh an access token using a refresh token.
   *
   * @param config OAuth configuration
   * @param refreshToken The refresh token
   * @param tokenUrl The token endpoint URL
   * @param mcpServerUrl The MCP server URL to use as the resource parameter
   * @returns The new token response
   */
  async refreshAccessToken(
    config: MCPOAuthConfig,
    refreshToken: string,
    tokenUrl: string,
    mcpServerUrl?: string,
  ): Promise<OAuthTokenResponse> {
    return refreshAccessTokenShared(
      {
        clientId: config.clientId!,
        clientSecret: config.clientSecret,
        scopes: config.scopes,
        audiences: config.audiences,
      },
      refreshToken,
      tokenUrl,
      this.buildResourceParam(mcpServerUrl),
    );
  }

  /**
   * Perform the full OAuth authorization code flow with PKCE.
   *
   * @param serverName The name of the MCP server
   * @param config OAuth configuration
   * @param mcpServerUrl Optional MCP server URL for OAuth discovery
   * @param messageHandler Optional handler for displaying user-facing messages
   * @returns The obtained OAuth token
   */
  async authenticate(
    serverName: string,
    config: MCPOAuthConfig,
    mcpServerUrl?: string,
  ): Promise<OAuthToken> {
    // Helper function to display messages through handler or fallback to console.log
    const displayMessage = (message: string) => {
      coreEvents.emitFeedback('info', message);
    };

    // If no authorization URL is provided, try to discover OAuth configuration
    if (!config.authorizationUrl && mcpServerUrl) {
      debugLogger.debug(`Starting OAuth for MCP server "${serverName}"…
✓ No authorization URL; using OAuth discovery`);

      // First check if the server requires authentication via WWW-Authenticate header
      try {
        const headers: HeadersInit = OAuthUtils.isSSEEndpoint(mcpServerUrl)
          ? { Accept: 'text/event-stream' }
          : { Accept: 'application/json' };

        const response = await fetch(mcpServerUrl, {
          method: 'HEAD',
          headers,
        });

        if (response.status === 401 || response.status === 307) {
          const wwwAuthenticate = response.headers.get('www-authenticate');

          if (wwwAuthenticate) {
            const discoveredConfig =
              await OAuthUtils.discoverOAuthFromWWWAuthenticate(
                wwwAuthenticate,
                mcpServerUrl,
              );
            if (discoveredConfig) {
              // Merge discovered config with existing config, preserving clientId and clientSecret
              config = {
                ...config,
                authorizationUrl: discoveredConfig.authorizationUrl,
                issuer: discoveredConfig.issuer,
                tokenUrl: discoveredConfig.tokenUrl,
                scopes: config.scopes || discoveredConfig.scopes || [],
                // Preserve existing client credentials
                clientId: config.clientId,
                clientSecret: config.clientSecret,
              };
            }
          }
        }
      } catch (error) {
        // Re-throw security validation errors
        if (error instanceof ResourceMismatchError) {
          throw error;
        }

        debugLogger.debug(
          `Failed to check endpoint for authentication requirements: ${getErrorMessage(error)}`,
        );
      }

      // If we still don't have OAuth config, try the standard discovery
      if (!config.authorizationUrl) {
        const discoveredConfig =
          await this.discoverOAuthFromMCPServer(mcpServerUrl);
        if (discoveredConfig) {
          // Merge discovered config with existing config, preserving clientId and clientSecret
          config = {
            ...config,
            authorizationUrl: discoveredConfig.authorizationUrl,
            tokenUrl: discoveredConfig.tokenUrl,
            issuer: discoveredConfig.issuer,
            scopes: config.scopes || discoveredConfig.scopes || [],
            registrationUrl: discoveredConfig.registrationUrl,
            // Preserve existing client credentials
            clientId: config.clientId,
            clientSecret: config.clientSecret,
          };
        } else {
          throw new Error(
            'Failed to discover OAuth configuration from MCP server',
          );
        }
      }
    }

    // Generate PKCE parameters
    const pkceParams = generatePKCEParams();

    // Determine preferred port from redirectUri if available
    const preferredPort = getPortFromUrl(config.redirectUri);

    // Start callback server first to allocate port
    // This ensures we only create one server and eliminates race conditions
    const callbackServer = startCallbackServer(pkceParams.state, preferredPort);

    // Wait for server to start and get the allocated port
    // We need this port for client registration and auth URL building
    const redirectPort = await callbackServer.port;
    debugLogger.debug(`Callback server listening on port ${redirectPort}`);

    // If no client ID is provided, try dynamic client registration
    if (!config.clientId) {
      let registrationUrl = config.registrationUrl;

      // If no registration URL was previously discovered, try to discover it
      if (!registrationUrl) {
        // Use the issuer to discover registration endpoint
        if (!config.issuer) {
          throw new Error('Cannot perform dynamic registration without issuer');
        }

        debugLogger.debug('→ Attempting dynamic client registration...');
        const { metadata: authServerMetadata } =
          await this.discoverAuthServerMetadataForRegistration(config.issuer);
        registrationUrl = authServerMetadata.registration_endpoint;
      }

      // Register client if registration endpoint is available
      if (registrationUrl) {
        const clientRegistration = await this.registerClient(
          registrationUrl,
          config,
          redirectPort,
        );

        config.clientId = clientRegistration.client_id;
        if (clientRegistration.client_secret) {
          config.clientSecret = clientRegistration.client_secret;
        }

        debugLogger.debug('✓ Dynamic client registration successful');
      } else {
        throw new Error(
          'No client ID provided and dynamic registration not supported',
        );
      }
    }

    // Validate configuration
    if (!config.clientId || !config.authorizationUrl || !config.tokenUrl) {
      throw new Error(
        'Missing required OAuth configuration after discovery and registration',
      );
    }

    // Build flow config for shared utilities
    const flowConfig: OAuthFlowConfig = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authorizationUrl: config.authorizationUrl,
      tokenUrl: config.tokenUrl,
      scopes: config.scopes,
      audiences: config.audiences,
      redirectUri: config.redirectUri,
    };

    // Build authorization URL
    const resource = this.buildResourceParam(mcpServerUrl);
    const authUrl = buildAuthorizationUrl(
      flowConfig,
      pkceParams,
      redirectPort,
      resource,
    );

    const userConsent = await getConsentForOauth(
      `Authentication required for MCP Server: '${serverName}.'`,
    );
    if (!userConsent) {
      throw new FatalCancellationError('Authentication cancelled by user.');
    }

    displayMessage(`→ Opening your browser for OAuth sign-in...

If the browser does not open, copy and paste this URL into your browser:
${authUrl}

💡 TIP: Triple-click to select the entire URL, then copy and paste it into your browser.
⚠️  Make sure to copy the COMPLETE URL - it may wrap across multiple lines.`);

    // Open browser securely (callback server is already running)
    try {
      await openBrowserSecurely(authUrl);
    } catch (error) {
      debugLogger.warn(
        'Failed to open browser automatically:',
        getErrorMessage(error),
      );
    }

    // Wait for callback
    const { code } = await callbackServer.response;

    debugLogger.debug(
      '✓ Authorization code received, exchanging for tokens...',
    );

    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForToken(
      flowConfig,
      code,
      pkceParams.codeVerifier,
      redirectPort,
      resource,
    );

    // Convert to our token format
    if (!tokenResponse.access_token) {
      throw new Error('No access token received from token endpoint');
    }

    const token: OAuthToken = {
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      refreshToken: tokenResponse.refresh_token,
      scope: tokenResponse.scope,
    };

    if (tokenResponse.expires_in) {
      token.expiresAt = Date.now() + tokenResponse.expires_in * 1000;
    }

    // Save token
    try {
      await this.tokenStorage.saveToken(
        serverName,
        token,
        config.clientId,
        config.tokenUrl,
        mcpServerUrl,
      );
      debugLogger.debug('✓ Authentication successful! Token saved.');

      // Verify token was saved
      const savedToken = await this.tokenStorage.getCredentials(serverName);
      if (savedToken && savedToken.token && savedToken.token.accessToken) {
        // Avoid leaking token material; log a short SHA-256 fingerprint instead.
        const tokenFingerprint = crypto
          .createHash('sha256')
          .update(savedToken.token.accessToken)
          .digest('hex')
          .slice(0, 8);
        debugLogger.debug(
          `✓ Token verification successful (fingerprint: ${tokenFingerprint})`,
        );
      } else {
        debugLogger.warn(
          'Token verification failed: token not found or invalid after save',
        );
      }
    } catch (saveError) {
      debugLogger.error('Failed to save auth token.', saveError);
      throw saveError;
    }

    return token;
  }

  /**
   * Get a valid access token for an MCP server, refreshing if necessary.
   *
   * @param serverName The name of the MCP server
   * @param config OAuth configuration
   * @returns A valid access token or null if not authenticated
   */
  async getValidToken(
    serverName: string,
    config: MCPOAuthConfig,
  ): Promise<string | null> {
    debugLogger.debug(`Getting valid token for server: ${serverName}`);
    const credentials = await this.tokenStorage.getCredentials(serverName);

    if (!credentials) {
      debugLogger.debug(`No credentials found for server: ${serverName}`);
      return null;
    }

    const { token } = credentials;
    debugLogger.debug(
      `Found token for server: ${serverName}, expired: ${this.tokenStorage.isTokenExpired(token)}`,
    );

    // Check if token is expired
    if (!this.tokenStorage.isTokenExpired(token)) {
      debugLogger.debug(`Returning valid token for server: ${serverName}`);
      return token.accessToken;
    }

    // Try to refresh if we have a refresh token
    if (token.refreshToken && config.clientId && credentials.tokenUrl) {
      try {
        debugLogger.log(
          `Refreshing expired token for MCP server: ${serverName}`,
        );

        const newTokenResponse = await this.refreshAccessToken(
          config,
          token.refreshToken,
          credentials.tokenUrl,
          credentials.mcpServerUrl,
        );

        // Update stored token
        const newToken: OAuthToken = {
          accessToken: newTokenResponse.access_token,
          tokenType: newTokenResponse.token_type,
          refreshToken: newTokenResponse.refresh_token || token.refreshToken,
          scope: newTokenResponse.scope || token.scope,
        };

        if (newTokenResponse.expires_in) {
          newToken.expiresAt = Date.now() + newTokenResponse.expires_in * 1000;
        }

        await this.tokenStorage.saveToken(
          serverName,
          newToken,
          config.clientId,
          credentials.tokenUrl,
          credentials.mcpServerUrl,
        );

        return newToken.accessToken;
      } catch (error) {
        coreEvents.emitFeedback(
          'error',
          'Failed to refresh auth token.',
          error,
        );
        // Remove invalid token
        await this.tokenStorage.deleteCredentials(serverName);
      }
    }

    return null;
  }
}
