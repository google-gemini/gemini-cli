/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

/**
 * Extension of OAuthClientProvider that allows providers to inject custom headers
 * into the transport request.
 */
export interface McpAuthProvider extends OAuthClientProvider {
  /**
   * Returns custom headers to be added to the request.
   */
  getRequestHeaders?(): Promise<Record<string, string>>;
}
