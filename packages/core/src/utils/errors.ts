/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GaxiosError } from 'gaxios';

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return String(error);
  } catch {
    return 'Failed to get error details';
  }
}

export class ForbiddenError extends Error {}
export class UnauthorizedError extends Error {}
export class BadRequestError extends Error {}

interface ResponseData {
  error?: {
    code?: number;
    message?: string;
  };
}

export function toFriendlyError(error: unknown): unknown {
  if (error instanceof GaxiosError) {
    const data = parseResponseData(error);
    if (data.error && data.error.message && data.error.code) {
      switch (data.error.code) {
        case 400:
          return new BadRequestError(data.error.message);
        case 401:
          return new UnauthorizedError(data.error.message);
        case 403:
          // It's import to pass the message here since it might
          // explain the cause like "the cloud project you're
          // using doesn't have code assist enabled".
          return new ForbiddenError(data.error.message);
        default:
      }
    }
  }
  return error;
}

function parseResponseData(error: GaxiosError): ResponseData {
  // Inexplicably, Gaxios sometimes doesn't JSONify the response data.
  if (typeof error.response?.data === 'string') {
    return JSON.parse(error.response?.data) as ResponseData;
  }
  return typeof error.response?.data as ResponseData;
}
