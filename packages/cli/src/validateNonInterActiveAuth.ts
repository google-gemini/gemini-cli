/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  debugLogger,
  OutputFormat,
  ExitCodes,
  getAuthTypeFromEnv,
  isLocalBackendAuthType,
  resolveLocalBackendBaseUrl,
  getLocalBackendName,
  type Config,
  type AuthType,
} from '@google/gemini-cli-core';
import { USER_SETTINGS_PATH, type LoadedSettings } from './config/settings.js';
import { validateAuthMethod } from './config/auth.js';
import { handleError } from './utils/errors.js';
import { runExitCleanup } from './utils/cleanup.js';

export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
  settings: LoadedSettings,
) {
  try {
    const effectiveAuthType = configuredAuthType || getAuthTypeFromEnv();

    const enforcedType = settings.merged.security.auth.enforcedType;
    if (enforcedType && effectiveAuthType !== enforcedType) {
      const message = effectiveAuthType
        ? `The enforced authentication type is '${enforcedType}', but the current type is '${effectiveAuthType}'. Please re-authenticate with the correct type.`
        : `The auth type '${enforcedType}' is enforced, but no authentication is configured.`;
      throw new Error(message);
    }

    if (!effectiveAuthType) {
      const message = `Please set an Auth method in your ${USER_SETTINGS_PATH} or specify one of the following environment variables before running: GEMINI_LOCAL_BACKEND, GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`;
      throw new Error(message);
    }

    const authType: AuthType = effectiveAuthType;

    if (!useExternalAuth) {
      const err = await validateAuthMethod(String(authType));
      if (err != null) {
        throw new Error(err);
      }
    }

    if (isLocalBackendAuthType(authType)) {
      const baseUrl = resolveLocalBackendBaseUrl(authType);
      const healthError = await checkLocalBackendHealth(baseUrl);
      if (healthError) {
        throw new Error(
          `${getLocalBackendName(authType)} is not running at ${baseUrl}. Please start the backend and try again.\n` +
            `See: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/local-gemma-4.md`,
        );
      }
    }

    return authType;
  } catch (error) {
    if (nonInteractiveConfig.getOutputFormat() === OutputFormat.JSON) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        nonInteractiveConfig,
        ExitCodes.FATAL_AUTHENTICATION_ERROR,
      );
    } else {
      debugLogger.error(error instanceof Error ? error.message : String(error));
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_AUTHENTICATION_ERROR);
    }
  }
}

async function checkLocalBackendHealth(
  baseUrl: string,
): Promise<string | null> {
  try {
    const url = new URL(
      'models',
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    ).toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return `Backend health check failed with status ${response.status}`;
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return 'Backend health check timed out after 2000ms';
    }
    return `Backend health check error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
