/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * OAuth authorization response.
 */
export interface OAuthAuthorizationResponse {
  code: string;
  state: string;
}

type CallbackServer = {
  port: Promise<number>;
  waitForResponse: () => Promise<OAuthAuthorizationResponse>;
  close: () => Promise<void>;
};

export class MCPOAuthClientProvider implements OAuthClientProvider {
  private _clientInformation?: OAuthClientInformation;
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  private _cbServer?: CallbackServer;

  constructor(
    private readonly _redirectUrl: string | URL,
    private readonly _clientMetadata: OAuthClientMetadata,
    private readonly _state?: string | undefined,
    private readonly _onRedirect: (url: URL) => void = (url) => {
      debugLogger.log(`Redirect to: ${url.toString()}`);
    },
  ) {}

  get redirectUrl(): string | URL {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata;
  }

  saveCallbackServer(server: CallbackServer): void {
    this._cbServer = server;
  }

  getSavedCallbackServer(): CallbackServer | undefined {
    return this._cbServer;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformation): void {
    this._clientInformation = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this._onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('No code verifier saved');
    }
    return this._codeVerifier;
  }

  state(): string {
    if (!this._state) {
      throw new Error('No code state saved');
    }
    return this._state;
  }
}
