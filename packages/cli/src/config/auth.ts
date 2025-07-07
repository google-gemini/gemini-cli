/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment } from './settings.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  if (authMethod === AuthType.LOGIN_WITH_GOOGLE) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return 'GEMINI_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_AZURE) {
    if (!process.env.AZURE_API_KEY || !process.env.AZURE_ENDPOINT_URL || !process.env.AZURE_API_VERSION) {
      return 'AZURE_API_KEY, AZURE_ENDPOINT_URL, and AZURE_API_VERSION environment variables are required for Azure authentication. Add these to your .env file and try again!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env.GOOGLE_CLOUD_PROJECT && !!process.env.GOOGLE_CLOUD_LOCATION;
    const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        'Must specify GOOGLE_GENAI_USE_VERTEXAI=true and either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        'Update your .env and try again, no reload needed!'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_OPENAI_COMPATIBLE) {
    if (!process.env.OPENAI_API_KEY) {
      return 'OPENAI_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_ANTHROPIC) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return 'ANTHROPIC_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_LOCAL_LLM) {
    if (!process.env.CUSTOM_BASE_URL) {
      return 'CUSTOM_BASE_URL environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  return 'Invalid auth method selected.';
};
