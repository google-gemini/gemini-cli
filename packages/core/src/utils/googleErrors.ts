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
    subject?: string;
    description?: string;
    apiService?: string;
    quotaMetric?: string;
    quotaId?: string;
    quotaDimensions?: { [key: string]: string };
    quotaValue?: string | number;
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

type ErrorShape = {
  message?: string;
  details?: unknown[];
  code?: number;
};

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

  if (Array.isArray(errorObj) && errorObj.length > 0) {
    errorObj = errorObj[0];
  }

  if (typeof errorObj !== 'object' || errorObj === null) {
    return null;
  }

  let currentError: ErrorShape | undefined =
    fromGaxiosError(errorObj) ?? fromApiError(errorObj);

  let depth = 0;
  const maxDepth = 10;
  // Handle cases where the actual error object is stringified inside the message
  // by drilling down until we find an error that doesn't have a stringified message.
  while (
    currentError &&
    typeof currentError.message === 'string' &&
    depth < maxDepth
  ) {
    try {
      const parsedMessage = JSON.parse(
        currentError.message.replace(/\u00A0/g, '').replace(/\n/g, ' '),
      );
      if (parsedMessage.error) {
        currentError = parsedMessage.error;
        depth++;
      } else {
        // The message is a JSON string, but not a nested error object.
        break;
      }
    } catch (_error) {
      // It wasn't a JSON string, so we've drilled down as far as we can.
      break;
    }
  }

  if (!currentError) {
    return null;
  }

  const code = currentError.code;
  const message = currentError.message;
  const errorDetails = currentError.details;

  if (code && message) {
    const details: GoogleApiErrorDetail[] = [];
    if (Array.isArray(errorDetails)) {
      for (const detail of errorDetails) {
        if (detail && typeof detail === 'object') {
          const detailObj = detail as Record<string, unknown>;
          const typeKey = Object.keys(detailObj).find(
            (key) => key.trim() === '@type',
          );
          if (typeKey) {
            if (typeKey !== '@type') {
              detailObj['@type'] = detailObj[typeKey];
              delete detailObj[typeKey];
            }
            // We can just cast it; the consumer will have to switch on @type
            details.push(detailObj as unknown as GoogleApiErrorDetail);
          }
        }
      }
    }

    return {
      code,
      message,
      details,
    };
  }

  return null;
}

function fromGaxiosError(errorObj: object): ErrorShape | undefined {
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
    let data = gaxiosError.response.data;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_) {
        // Not a JSON string, can't parse.
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      data = data[0];
    }

    if (typeof data === 'object' && data !== null) {
      if ('error' in data) {
        outerError = (data as { error: ErrorShape }).error;
      }
    }
  }

  if (!outerError) {
    // If the gaxios structure isn't there, check for a top-level `error` property.
    if (gaxiosError.error) {
      outerError = gaxiosError.error;
    } else {
      return undefined;
    }
  }
  return outerError;
}

function fromApiError(errorObj: object): ErrorShape | undefined {
  const apiError = errorObj as {
    message?:
      | {
          error?: ErrorShape;
        }
      | string;
    code?: number;
  };

  let outerError: ErrorShape | undefined;
  if (apiError.message) {
    let data = apiError.message;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_) {
        // Not a JSON string, can't parse.
        // Try one more fallback: look for the first '{' and last '}'
        if (typeof data === 'string') {
          const firstBrace = data.indexOf('{');
          const lastBrace = data.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
              data = JSON.parse(data.substring(firstBrace, lastBrace + 1));
            } catch (__) {
              // Still failed
            }
          }
        }
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      data = data[0];
    }

    if (typeof data === 'object' && data !== null) {
      if ('error' in data) {
        outerError = (data as { error: ErrorShape }).error;
      }
    }
  }
  return outerError;
}
