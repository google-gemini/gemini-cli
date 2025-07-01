/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, Config } from '@google/gemini-cli-core';
import { loadEnvironment } from './config.js';
import { Settings } from './settings.js';

export const validateAuthMethod = (
  config: Config | Settings,
  authMethod: string,
): string | null => {
  loadEnvironment();
  if (authMethod === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return null;
  }

  const auth = config instanceof Config ? config.getAuth() : config.auth;

  if (authMethod === AuthType.USE_GEMINI) {
    const apiKey = auth?.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return (
        'Unale to find Gemini API Key. You need to do either:\n' +
        '• Set the environment variable GEMINI_API_KEY then try again, no reload needed!\n' +
        '• Configure `auth.gemini.apiKey` in your settings.json then reload gemini-cli.'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const project = auth?.vertex?.project || process.env.GOOGLE_CLOUD_PROJECT;
    const location =
      auth?.vertex?.location || process.env.GOOGLE_CLOUD_LOCATION;
    const apiKey = auth?.vertex?.apiKey || process.env.GOOGLE_API_KEY;
    const hasVertexProjectLocationConfig = !!project && !!location;
    const hasGoogleApiKey = !!apiKey;
    if (hasVertexProjectLocationConfig || hasGoogleApiKey) {
      return null;
    }
    return (
      'Unable to find valid Vertex AI configuration. You need to do one of:\n' +
      '• Set the environment variable GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION.\n' +
      '• Configure `auth.vertex.project` and `auth.vertex.location` in your settings.json.\n' +
      '• Set the environment variable GOOGLE_API_KEY environment variable (if using express mode).\n' +
      '• Configure `auth.vertex.apiKey` in your settings.json (if using express mode).\n' +
      'If you use the environment variables, update your .env and try again, no reload needed!\n' +
      'Otherwise, reload reload gemini-cli.'
    );
  }

  return 'Invalid auth method selected.';
};
