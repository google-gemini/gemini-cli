/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreI18nMessages } from '../types.js';

export const coreEnMessages: CoreI18nMessages = {
  tools: {
    fileOperations: {
      readFile: 'Reading file',
      writeFile: 'Writing file',
      fileNotFound: 'File not found',
      permissionDenied: 'Permission denied',
    },
    shellCommands: {
      executing: 'Executing command',
      completed: 'Command completed',
      failed: 'Command failed',
    },
    webFetching: {
      fetching: 'Fetching URL',
      success: 'Fetch completed',
      failed: 'Fetch failed',
    },
  },
  api: {
    authentication: {
      authenticating: 'Authenticating',
      success: 'Authentication successful',
      failed: 'Authentication failed',
      tokenExpired: 'Authentication token expired',
    },
    requests: {
      sending: 'Sending request',
      processing: 'Processing request',
      completed: 'Request completed',
      failed: 'Request failed',
      rateLimited: 'Rate limited',
    },
  },
  errors: {
    networkTimeout: 'Network timeout',
    invalidApiKey: 'Invalid API key',
    quotaExceeded: 'Quota exceeded',
    serviceUnavailable: 'Service unavailable',
    invalidRequest: 'Invalid request',
    serverError: 'Server error',
  },
  status: {
    initializing: 'Initializing',
    ready: 'Ready',
    busy: 'Busy',
    error: 'Error',
    offline: 'Offline',
  },
};
