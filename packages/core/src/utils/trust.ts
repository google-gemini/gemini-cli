/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function getIdeWorkspaceTrustOverride(): boolean | undefined {
  const isTrusted = process.env['GEMINI_CLI_IDE_WORKSPACE_TRUST'];
  if (isTrusted === 'true') {
    return true;
  } else if (isTrusted === 'false') {
    return false;
  }
  return undefined;
}
