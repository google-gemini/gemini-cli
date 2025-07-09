/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ApiError {
  error: {
    code: number;
    message: string;
    status: string;
    details: unknown[];
  };
}

interface StructuredError {
  message: string;
  status?: number;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as ApiError).error === 'object' &&
    'message' in (error as ApiError).error
  );
}

export function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as StructuredError).message === 'string'
  );
}

export function isProQuotaExceededError(error: unknown): boolean {
  // Regular expression to match "Quota exceeded for quota metric 'Gemini" followed by any version string and "Pro Requests'"
  // This will match patterns like:
  // - "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'"
  // - "Quota exceeded for quota metric 'Gemini 1.5-preview Pro Requests'"
  // - "Quota exceeded for quota metric 'Gemini beta-3.0 Pro Requests'"
  // - "Quota exceeded for quota metric 'Gemini experimental-v2 Pro Requests'"
  // The pattern matches: "Gemini" + whitespace + any characters (non-greedy) + whitespace + "Pro Requests'"
  const proQuotaRegex = /Quota exceeded for quota metric 'Gemini\s+.*?\s+Pro Requests'/;
  
  if (typeof error === 'string') {
    return proQuotaRegex.test(error);
  }
  
  if (isStructuredError(error)) {
    return proQuotaRegex.test(error.message);
  }
  
  if (isApiError(error)) {
    return proQuotaRegex.test(error.error.message);
  }
  
  return false;
}

export function isGenericQuotaExceededError(error: unknown): boolean {
  if (typeof error === 'string') {
    return error.includes("Quota exceeded for quota metric");
  }
  
  if (isStructuredError(error)) {
    return error.message.includes("Quota exceeded for quota metric");
  }
  
  if (isApiError(error)) {
    return error.error.message.includes("Quota exceeded for quota metric");
  }
  
  return false;
}