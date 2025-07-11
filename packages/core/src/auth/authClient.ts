/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface for an authentication client that can provide headers.
 * Implementations of this interface can handle token refreshing or other
 * authentication mechanisms.
 */
export interface AuthClient {
  /**
   * Returns a promise that resolves to a record of HTTP headers.
   * These headers should include any necessary authentication tokens.
   */
  getHeaders(): Promise<Record<string, string>>;
}
