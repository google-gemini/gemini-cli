/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { URL } from 'node:url';
import open from 'open';
import { MCPOAuthToken, MCPOAuthTokenStorage } from './oauth-token-storage.js';
import { getErrorMessage } from '../utils/errors.js';
import { OAuthUtils } from './oauth-utils.js';

/**
 * OAuth configuration for an MCP server.
 */
export interface MCPOAuthConfig {
  enabled?: boolean; // Whether OAuth is enabled for this server
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  redirectUri?: string;
  tokenParamName?: string; // For SSE connections, specifies the query parameter name for the token
}

/**
 * OAuth authorization response.
 */
export interface OAuthAuthorizationResponse {
  code: string;
  state: string;
}

/**
 * OAuth token response from the authorization server.
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Dynamic client registration request.
 */
export interface OAuthClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  code_challenge_method?: string[];
  scope?: string;
}

/**
 * Dynamic client registration response.
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
  code_challenge_method?: string[];
  scope?: string;
}

/**
 * PKCE (Proof Key for Code Exchange) parameters.
 */
interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

/**
 * Provider for handling OAuth authentication for MCP servers.
 */
export class MCPOAuthProvider {
  private static readonly REDIRECT_PORT = 7777;
  private static readonly REDIRECT_PATH = '/oauth/callback';
  private static readonly HTTP_OK = 200;
  private static readonly HTTP_REDIRECT = 302;

  /**
   * Register a client dynamically with the OAuth server.
   *
   * @param registrationUrl The client registration endpoint URL
   * @param config OAuth configuration
   * @returns The registered client information
   */
  private static async registerClient(
    registrationUrl: string,
    config: MCPOAuthConfig,
  ): Promise<OAuthClientRegistrationResponse> {
    const redirectUri =
      config.redirectUri ||
      `http://localhost:${this.REDIRECT_PORT}${this.REDIRECT_PATH}`;

    const registrationRequest: OAuthClientRegistrationRequest = {
      client_name: 'Gemini CLI MCP Client',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none', // Public client
      code_challenge_method: ['S256'],
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

    return (await response.json()) as OAuthClientRegistrationResponse;
  }

  /**
   * Discover OAuth configuration from an MCP server URL.
   *
   * @param mcpServerUrl The MCP server URL
   * @returns OAuth configuration if discovered, null otherwise
   */
  private static async discoverOAuthFromMCPServer(
    mcpServerUrl: string,
  ): Promise<MCPOAuthConfig | null> {
    const baseUrl = OAuthUtils.extractBaseUrl(mcpServerUrl);
    return OAuthUtils.discoverOAuthConfig(baseUrl);
  }

  /**
   * Generate PKCE parameters for OAuth flow.
   *
   * @returns PKCE parameters including code verifier, challenge, and state
   */
  private static generatePKCEParams(): PKCEParams {
    // Generate code verifier (43-128 characters)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // Generate code challenge using SHA256
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('base64url');

    return { codeVerifier, codeChallenge, state };
  }

  /**
   * Start a local HTTP server to handle OAuth callback.
   *
   * @param expectedState The state parameter to validate
   * @returns Promise that resolves with the authorization code
   */
  private static async startCallbackServer(
    expectedState: string,
  ): Promise<OAuthAuthorizationResponse> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(
        async (req: http.IncomingMessage, res: http.ServerResponse) => {
          try {
            const url = new URL(
              req.url!,
              `http://localhost:${this.REDIRECT_PORT}`,
            );

            if (url.pathname !== this.REDIRECT_PATH) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }

            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');

            if (error) {
              res.writeHead(this.HTTP_OK, { 'Content-Type': 'text/html' });
              res.end(`
              <html>
                <body>
                  <h1>Authentication Failed</h1>
                  <p>Error: ${(error as string).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                  <p>${((url.searchParams.get('error_description') || '') as string).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
              server.close();
              reject(new Error(`OAuth error: ${error}`));
              return;
            }

            if (!code || !state) {
              res.writeHead(400);
              res.end('Missing code or state parameter');
              return;
            }

            if (state !== expectedState) {
              res.writeHead(400);
              res.end('Invalid state parameter');
              server.close();
              reject(new Error('State mismatch - possible CSRF attack'));
              return;
            }

            // Send success response to browser
            res.writeHead(this.HTTP_OK, { 'Content-Type': 'text/html' });
            res.end(`
            <html>
              <body>
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to Gemini CLI.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);

            server.close();
            resolve({ code, state });
          } catch (error) {
            server.close();
            reject(error);
          }
        },
      );

      server.on('error', reject);
      server.listen(this.REDIRECT_PORT, () => {
        console.log(
          `OAuth callback server listening on port ${this.REDIRECT_PORT}`,
        );
      });

      // Timeout after 5 minutes
      setTimeout(
        () => {
          server.close();
          reject(new Error('OAuth callback timeout'));
        },
        5 * 60 * 1000,
      );
    });
  }

  /**
   * Build the authorization URL with PKCE parameters.
   *
   * @param config OAuth configuration
   * @param pkceParams PKCE parameters
   * @param mcpServerUrl The MCP server URL to use as the resource parameter
   * @returns The authorization URL
   */
  private static buildAuthorizationUrl(
    config: MCPOAuthConfig,
    pkceParams: PKCEParams,
    mcpServerUrl?: string,
  ): string {
    const redirectUri =
      config.redirectUri ||
      `http://localhost:${this.REDIRECT_PORT}${this.REDIRECT_PATH}`;

    const params = new URLSearchParams({
      client_id: config.clientId!,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: pkceParams.state,
      code_challenge: pkceParams.codeChallenge,
      code_challenge_method: 'S256',
    });

    if (config.scopes && config.scopes.length > 0) {
      params.append('scope', config.scopes.join(' '));
    }

    // Add resource parameter for MCP OAuth spec compliance
    // Use the MCP server URL if provided, otherwise fall back to authorization URL
    const resourceUrl = mcpServerUrl || config.authorizationUrl!;
    try {
      params.append('resource', OAuthUtils.buildResourceParameter(resourceUrl));
    } catch (error) {
      throw new Error(
        `Invalid resource URL: "${resourceUrl}". ${getErrorMessage(error)}`,
      );
    }

    return `${config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens.
   *
   * @param config OAuth configuration
   * @param code Authorization code
   * @param codeVerifier PKCE code verifier
   * @param mcpServerUrl The MCP server URL to use as the resource parameter
   * @returns The token response
   */
  private static async exchangeCodeForToken(
    config: MCPOAuthConfig,
    code: string,
    codeVerifier: string,
    mcpServerUrl?: string,
  ): Promise<OAuthTokenResponse> {
    const redirectUri =
      config.redirectUri ||
      `http://localhost:${this.REDIRECT_PORT}${this.REDIRECT_PATH}`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: config.clientId!,
    });

    if (config.clientSecret) {
      params.append('client_secret', config.clientSecret);
    }

    // Add resource parameter for MCP OAuth spec compliance
    // Use the MCP server URL if provided, otherwise fall back to token URL
    const resourceUrl = mcpServerUrl || config.tokenUrl!;
    try {
      params.append('resource', OAuthUtils.buildResourceParameter(resourceUrl));
    } catch (error) {
      throw new Error(
        `Invalid resource URL: "${resourceUrl}". ${getErrorMessage(error)}`,
      );
    }

    const response = await fetch(config.tokenUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token exchange failed: ${response.status} - ${errorText}`,
      );
    }

    return (await response.json()) as OAuthTokenResponse;
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
  static async refreshAccessToken(
    config: MCPOAuthConfig,
    refreshToken: string,
    tokenUrl: string,
    mcpServerUrl?: string,
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId!,
    });

    if (config.clientSecret) {
      params.append('client_secret', config.clientSecret);
    }

    if (config.scopes && config.scopes.length > 0) {
      params.append('scope', config.scopes.join(' '));
    }

    // Add resource parameter for MCP OAuth spec compliance
    // Use the MCP server URL if provided, otherwise fall back to token URL
    const resourceUrl = mcpServerUrl || tokenUrl;
    try {
      params.append('resource', OAuthUtils.buildResourceParameter(resourceUrl));
    } catch (error) {
      throw new Error(
        `Invalid resource URL: "${resourceUrl}". ${getErrorMessage(error)}`,
      );
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token refresh failed: ${response.status} - ${errorText}`,
      );
    }

    return (await response.json()) as OAuthTokenResponse;
  }

  /**
   * Perform the full OAuth authorization code flow with PKCE.
   *
   * @param serverName The name of the MCP server
   * @param config OAuth configuration
   * @param mcpServerUrl Optional MCP server URL for OAuth discovery
   * @returns The obtained OAuth token
   */
  static async authenticate(
    serverName: string,
    config: MCPOAuthConfig,
    mcpServerUrl?: string,
  ): Promise<MCPOAuthToken> {
    // If no authorization URL is provided, try to discover OAuth configuration
    if (!config.authorizationUrl && mcpServerUrl) {
      console.log(
        'No authorization URL provided, attempting OAuth discovery...',
      );

      // For SSE URLs, first check if authentication is required
      if (OAuthUtils.isSSEEndpoint(mcpServerUrl)) {
        try {
          const response = await fetch(mcpServerUrl, {
            method: 'HEAD',
            headers: {
              Accept: 'text/event-stream',
            },
          });

          if (response.status === 401 || response.status === 307) {
            const wwwAuthenticate = response.headers.get('www-authenticate');
            if (wwwAuthenticate) {
              const discoveredConfig =
                await OAuthUtils.discoverOAuthFromWWWAuthenticate(
                  wwwAuthenticate,
                );
              if (discoveredConfig) {
                config = {
                  ...config,
                  ...discoveredConfig,
                  scopes: discoveredConfig.scopes || config.scopes || [],
                };
              }
            }
          }
        } catch (error) {
          console.debug(
            `Failed to check SSE endpoint for authentication requirements: ${getErrorMessage(error)}`,
          );
        }
      }

      // If we still don't have OAuth config, try the standard discovery
      if (!config.authorizationUrl) {
        const discoveredConfig =
          await this.discoverOAuthFromMCPServer(mcpServerUrl);
        if (discoveredConfig) {
          config = { ...config, ...discoveredConfig };
          console.log('OAuth configuration discovered successfully');
        } else {
          throw new Error(
            'Failed to discover OAuth configuration from MCP server',
          );
        }
      }
    }

    // If no client ID is provided, try dynamic client registration
    if (!config.clientId) {
      // Extract server URL from authorization URL
      if (!config.authorizationUrl) {
        throw new Error(
          'Cannot perform dynamic registration without authorization URL',
        );
      }

      const authUrl = new URL(config.authorizationUrl);
      const serverUrl = `${authUrl.protocol}//${authUrl.host}`;

      console.log(
        'No client ID provided, attempting dynamic client registration...',
      );

      // Get the authorization server metadata for registration
      const authServerMetadataUrl = new URL(
        '/.well-known/oauth-authorization-server',
        serverUrl,
      ).toString();

      const authServerMetadata =
        await OAuthUtils.fetchAuthorizationServerMetadata(
          authServerMetadataUrl,
        );
      if (!authServerMetadata) {
        throw new Error(
          'Failed to fetch authorization server metadata for client registration',
        );
      }

      // Register client if registration endpoint is available
      if (authServerMetadata.registration_endpoint) {
        const clientRegistration = await this.registerClient(
          authServerMetadata.registration_endpoint,
          config,
        );

        config.clientId = clientRegistration.client_id;
        if (clientRegistration.client_secret) {
          config.clientSecret = clientRegistration.client_secret;
        }

        console.log('Dynamic client registration successful');
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

    // Generate PKCE parameters
    const pkceParams = this.generatePKCEParams();

    // Build authorization URL
    const authUrl = this.buildAuthorizationUrl(
      config,
      pkceParams,
      mcpServerUrl,
    );

    console.log('\nOpening browser for OAuth authentication...');
    console.log('If the browser does not open, please visit:');
    console.log('');

    // Get terminal width or default to 80
    const terminalWidth = process.stdout.columns || 80;
    const separatorLength = Math.min(terminalWidth - 2, 80);
    const separator = '━'.repeat(separatorLength);

    console.log(separator);
    console.log(
      'COPY THE ENTIRE URL BELOW (select all text between the lines):',
    );
    console.log(separator);
    console.log(authUrl);
    console.log(separator);
    console.log('');
    console.log(
      '💡 TIP: Triple-click to select the entire URL, then copy and paste it into your browser.',
    );
    console.log(
      '⚠️  Make sure to copy the COMPLETE URL - it may wrap across multiple lines.',
    );
    console.log('');

    // Start callback server
    const callbackPromise = this.startCallbackServer(pkceParams.state);

    // Open browser
    try {
      await open(authUrl);
    } catch (error) {
      console.warn(
        'Failed to open browser automatically:',
        getErrorMessage(error),
      );
    }

    // Wait for callback
    const { code } = await callbackPromise;

    console.log('\nAuthorization code received, exchanging for tokens...');

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForToken(
      config,
      code,
      pkceParams.codeVerifier,
      mcpServerUrl,
    );

    // Convert to our token format
    const token: MCPOAuthToken = {
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type,
      refreshToken: tokenResponse.refresh_token,
      scope: tokenResponse.scope,
    };

    if (tokenResponse.expires_in) {
      token.expiresAt = Date.now() + tokenResponse.expires_in * 1000;
    }

    // Save token
    try {
      await MCPOAuthTokenStorage.saveToken(
        serverName,
        token,
        config.clientId,
        config.tokenUrl,
        mcpServerUrl,
      );
      console.log('Authentication successful! Token saved.');

      // Verify token was saved
      const savedToken = await MCPOAuthTokenStorage.getToken(serverName);
      if (savedToken) {
        console.log(
          `Token verification successful: ${savedToken.token.accessToken.substring(0, 20)}...`,
        );
      } else {
        console.error('Token verification failed: token not found after save');
      }
    } catch (saveError) {
      console.error(`Failed to save token: ${getErrorMessage(saveError)}`);
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
  static async getValidToken(
    serverName: string,
    config: MCPOAuthConfig,
  ): Promise<string | null> {
    console.debug(`Getting valid token for server: ${serverName}`);
    const credentials = await MCPOAuthTokenStorage.getToken(serverName);

    if (!credentials) {
      console.debug(`No credentials found for server: ${serverName}`);
      return null;
    }

    const { token } = credentials;
    console.debug(
      `Found token for server: ${serverName}, expired: ${MCPOAuthTokenStorage.isTokenExpired(token)}`,
    );

    // Check if token is expired
    if (!MCPOAuthTokenStorage.isTokenExpired(token)) {
      console.debug(`Returning valid token for server: ${serverName}`);
      return token.accessToken;
    }

    // Try to refresh if we have a refresh token
    if (token.refreshToken && config.clientId && credentials.tokenUrl) {
      try {
        console.log(`Refreshing expired token for MCP server: ${serverName}`);

        const newTokenResponse = await this.refreshAccessToken(
          config,
          token.refreshToken,
          credentials.tokenUrl,
          credentials.mcpServerUrl,
        );

        // Update stored token
        const newToken: MCPOAuthToken = {
          accessToken: newTokenResponse.access_token,
          tokenType: newTokenResponse.token_type,
          refreshToken: newTokenResponse.refresh_token || token.refreshToken,
          scope: newTokenResponse.scope || token.scope,
        };

        if (newTokenResponse.expires_in) {
          newToken.expiresAt = Date.now() + newTokenResponse.expires_in * 1000;
        }

        await MCPOAuthTokenStorage.saveToken(
          serverName,
          newToken,
          config.clientId,
          credentials.tokenUrl,
          credentials.mcpServerUrl,
        );

        return newToken.accessToken;
      } catch (error) {
        console.error(`Failed to refresh token: ${getErrorMessage(error)}`);
        // Remove invalid token
        await MCPOAuthTokenStorage.removeToken(serverName);
      }
    }

    return null;
  }
}
