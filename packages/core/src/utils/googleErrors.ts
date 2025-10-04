/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * This file contains types and functions for parsing structured Google API errors.
 */

/**
 * Based on google/rpc/error_details.proto
 */

export interface ErrorInfo {
  '@type': 'type.googleapis.com/google.rpc.ErrorInfo';
  reason: string;
  domain: string;
  metadata: { [key: string]: string };
}

export interface RetryInfo {
  '@type': 'type.googleapis.com/google.rpc.RetryInfo';
  retryDelay: string; // e.g. "51820.638305887s"
}

export interface DebugInfo {
  '@type': 'type.googleapis.com/google.rpc.DebugInfo';
  stackEntries: string[];
  detail: string;
}

export interface QuotaFailure {
  '@type': 'type.googleapis.com/google.rpc.QuotaFailure';
  violations: Array<{
    subject: string;
    description: string;
    apiService?: string;
    quotaMetric?: string;
    quotaId?: string;
    quotaDimensions?: { [key: string]: string };
    quotaValue?: number;
    futureQuotaValue?: number;
  }>;
}

export interface PreconditionFailure {
  '@type': 'type.googleapis.com/google.rpc.PreconditionFailure';
  violations: Array<{
    type: string;
    subject: string;
    description: string;
  }>;
}

export interface LocalizedMessage {
  '@type': 'type.googleapis.com/google.rpc.LocalizedMessage';
  locale: string;
  message: string;
}

export interface BadRequest {
  '@type': 'type.googleapis.com/google.rpc.BadRequest';
  fieldViolations: Array<{
    field: string;
    description: string;
    reason?: string;
    localizedMessage?: LocalizedMessage;
  }>;
}

export interface RequestInfo {
  '@type': 'type.googleapis.com/google.rpc.RequestInfo';
  requestId: string;
  servingData: string;
}

export interface ResourceInfo {
  '@type': 'type.googleapis.com/google.rpc.ResourceInfo';
  resourceType: string;
  resourceName: string;
  owner: string;
  description: string;
}

export interface Help {
  '@type': 'type.googleapis.com/google.rpc.Help';
  links: Array<{
    description: string;
    url: string;
  }>;
}

export type GoogleApiErrorDetail =
  | ErrorInfo
  | RetryInfo
  | DebugInfo
  | QuotaFailure
  | PreconditionFailure
  | BadRequest
  | RequestInfo
  | ResourceInfo
  | Help
  | LocalizedMessage;

export interface GoogleApiError {
  code: number;
  message: string;
  details: GoogleApiErrorDetail[];
}

/**
 * Parses an error object to check if it's a structured Google API error
 * and extracts all details.
 *
 * This function can handle two formats:
 * 1. Standard Google API errors where `details` is a top-level field.
 * 2. Errors where the entire structured error object is stringified inside
 *    the `message` field of a wrapper error.
 *
 * @param error The error object to inspect.
 * @returns A GoogleApiError object if the error matches, otherwise null.
 */
export function parseGoogleApiError(error: unknown): GoogleApiError | null {
  if (!error) {
    return null;
  }

  let errorObj: unknown = error;

  // If error is a string, try to parse it.
  if (typeof errorObj === 'string') {
    try {
      errorObj = JSON.parse(errorObj);
    } catch (_) {
      // Not a JSON string, can't parse.
      return null;
    }
  }

  if (typeof errorObj !== 'object' || errorObj === null) {
    return null;
  }

  type ErrorShape = {
    message?: string;
    details?: unknown[];
    code?: number;
  };

  const gaxiosError = errorObj as {
    response?: {
      status?: number;
      data?:
        | {
            error?: ErrorShape;
          }
        | string;
    };
    error?: ErrorShape;
    code?: number;
  };

  let outerError: ErrorShape | undefined;
  if (gaxiosError.response?.data) {
    if (typeof gaxiosError.response.data === 'string') {
      try {
        const parsedData = JSON.parse(gaxiosError.response.data);
        if (parsedData.error) {
          outerError = parsedData.error;
        }
      } catch (_) {
        // Not a JSON string, or doesn't contain .error
      }
    } else if (
      typeof gaxiosError.response.data === 'object' &&
      gaxiosError.response.data !== null
    ) {
      outerError = (
        gaxiosError.response.data as {
          error?: ErrorShape;
        }
      ).error;
    }
  }
  const responseStatus = gaxiosError.response?.status;

  if (!outerError) {
    // If the gaxios structure isn't there, check for a top-level `error` property.
    if (gaxiosError.error) {
      outerError = gaxiosError.error;
    } else {
      return null;
    }
  }

  let currentError = outerError;
  let depth = 0;
  const maxDepth = 10;
  // Handle cases where the actual error object is stringified inside the message
  // by drilling down until we find an error that doesn't have a stringified message.
  while (typeof currentError.message === 'string' && depth < maxDepth) {
    try {
      const parsedMessage = JSON.parse(currentError.message);
      if (parsedMessage.error) {
        currentError = parsedMessage.error;
        depth++;
      } else {
        // The message is a JSON string, but not a nested error object.
        break;
      }
    } catch (_) {
      // It wasn't a JSON string, so we've drilled down as far as we can.
      break;
    }
  }

  const code = responseStatus ?? currentError.code ?? gaxiosError.code;
  const message = currentError.message;
  const errorDetails = currentError.details;

  if (Array.isArray(errorDetails) && code && message) {
    const details: GoogleApiErrorDetail[] = [];
    for (const detail of errorDetails) {
      if (detail && typeof detail === 'object' && '@type' in detail) {
        // We can just cast it; the consumer will have to switch on @type
        details.push(detail as GoogleApiErrorDetail);
      }
    }

    if (details.length > 0) {
      return {
        code,
        message,
        details,
      };
    }
  }

  return null;
}
