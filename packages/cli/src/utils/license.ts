/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, UserTierId } from '@google/gemini-cli-core';

/**
 * Get human-readable license display text based on auth type and user tier.
 * @param selectedAuthType - The authentication type selected by the user
 * @param userTier - Optional user tier information from the server
 * @returns Human-readable license information
 */
export function getLicenseDisplay(
  selectedAuthType: string,
  userTier?: UserTierId,
): string {
  switch (selectedAuthType) {
    case AuthType.LOGIN_WITH_GOOGLE:
      return 'Free Tier (Login with Google)';

    case AuthType.LOGIN_WITH_GOOGLE_GCA:
      if (userTier === UserTierId.STANDARD) {
        return 'Gemini Code Assist Standard (Google Workspace)';
      } else if (userTier === UserTierId.LEGACY) {
        return 'Gemini Code Assist Enterprise (Google Workspace)';
      }
      return 'Gemini Code Assist (Google Workspace)';

    case AuthType.USE_GEMINI:
      return 'Gemini API Key';

    case AuthType.USE_VERTEX_AI:
      return 'Vertex AI';

    case AuthType.CLOUD_SHELL:
      return 'Cloud Shell';

    default:
      return selectedAuthType;
  }
}
