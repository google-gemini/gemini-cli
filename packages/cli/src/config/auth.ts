/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@gemini-cli/core';
import { loadEnvironment } from './config.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  if (authMethod === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return null;
  }

  if (authMethod === AuthType.LOGIN_WITH_GOOGLE_ENTERPRISE) {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      return 'GOOGLE_CLOUD_PROJECT environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return 'GEMINI_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    if (!process.env.GOOGLE_API_KEY) {
      return 'GOOGLE_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      return 'GOOGLE_CLOUD_PROJECT environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    if (!process.env.GOOGLE_CLOUD_LOCATION) {
      return 'GOOGLE_CLOUD_LOCATION environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  return 'Invalid auth method selected.';
};
