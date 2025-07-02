/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class UnsupportedAuthTypeError extends Error {
  constructor(authType: string) {
    super(`Unsupported authType: ${authType}`);
    this.name = 'UnsupportedAuthTypeError';
  }
}

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires setting the GOOGLE_CLOUD_PROJECT env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
    this.name = 'ProjectIdRequiredError';
  }
}
