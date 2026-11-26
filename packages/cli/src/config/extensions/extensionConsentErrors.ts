/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thrown when the user declines the consent request to install or update an
 * extension. Nothing has been changed on disk when it's thrown.
 */
export class ExtensionConsentDeclinedError extends Error {
  constructor(readonly extensionName: string) {
    super(`Installation cancelled for "${extensionName}".`);
    this.name = 'ExtensionConsentDeclinedError';
  }
}
