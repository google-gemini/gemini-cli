/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CoreI18nMessages {
  tools: {
    fileOperations: {
      readFile: string;
      writeFile: string;
      fileNotFound: string;
      permissionDenied: string;
    };
    shellCommands: {
      executing: string;
      completed: string;
      failed: string;
    };
    webFetching: {
      fetching: string;
      success: string;
      failed: string;
    };
  };
  api: {
    authentication: {
      authenticating: string;
      success: string;
      failed: string;
      tokenExpired: string;
    };
    requests: {
      sending: string;
      processing: string;
      completed: string;
      failed: string;
      rateLimited: string;
    };
  };
  errors: {
    networkTimeout: string;
    invalidApiKey: string;
    quotaExceeded: string;
    serviceUnavailable: string;
    invalidRequest: string;
    serverError: string;
  };
  status: {
    initializing: string;
    ready: string;
    busy: string;
    error: string;
    offline: string;
  };
}

export type CoreI18nKey = keyof CoreI18nMessages;
export type CoreNestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${CoreNestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type CoreI18nTranslationKey = CoreNestedKeyOf<CoreI18nMessages>;
