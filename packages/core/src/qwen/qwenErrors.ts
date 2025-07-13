/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum QwenErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  INVALID_REQUEST = 'INVALID_REQUEST',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class QwenError extends Error {
  public readonly type: QwenErrorType;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly originalError?: unknown;

  constructor(
    type: QwenErrorType,
    message: string,
    statusCode?: number,
    retryable: boolean = false,
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'QwenError';
    this.type = type;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.originalError = originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QwenError);
    }
  }

  static fromHttpStatus(
    status: number,
    statusText: string,
    responseBody?: string,
  ): QwenError {
    let type: QwenErrorType;
    let retryable = false;

    switch (status) {
      case 401:
        type = QwenErrorType.AUTHENTICATION_ERROR;
        break;
      case 403:
        type = QwenErrorType.QUOTA_EXCEEDED;
        break;
      case 404:
        type = QwenErrorType.MODEL_NOT_FOUND;
        break;
      case 429:
        type = QwenErrorType.RATE_LIMIT_ERROR;
        retryable = true;
        break;
      case 400:
        type = QwenErrorType.INVALID_REQUEST;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        type = QwenErrorType.API_ERROR;
        retryable = true;
        break;
      default:
        type = QwenErrorType.UNKNOWN_ERROR;
        retryable = status >= 500;
    }

    const message = responseBody
      ? `Qwen API error (${status}): ${statusText} - ${responseBody}`
      : `Qwen API error (${status}): ${statusText}`;

    return new QwenError(type, message, status, retryable);
  }

  static fromNetworkError(error: unknown): QwenError {
    const message = error instanceof Error ? error.message : 'Network error';
    return new QwenError(
      QwenErrorType.NETWORK_ERROR,
      `Network error: ${message}`,
      undefined,
      true,
      error,
    );
  }

  static fromTimeoutError(): QwenError {
    return new QwenError(
      QwenErrorType.TIMEOUT_ERROR,
      'Request timeout',
      undefined,
      true,
    );
  }
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrorTypes: QwenErrorType[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableErrorTypes: [
    QwenErrorType.NETWORK_ERROR,
    QwenErrorType.RATE_LIMIT_ERROR,
    QwenErrorType.API_ERROR,
    QwenErrorType.TIMEOUT_ERROR,
  ],
};

export class RetryHandler {
  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    abortSignal?: AbortSignal,
  ): Promise<T> {
    let lastError: QwenError | unknown;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }

      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt++;

        // Don't retry if we've exhausted attempts
        if (attempt > this.config.maxRetries) {
          break;
        }

        // Only retry for specific error types
        if (error instanceof QwenError) {
          if (!this.shouldRetry(error)) {
            throw error;
          }
        } else {
          // For non-QwenError, convert to network error and retry
          const qwenError = QwenError.fromNetworkError(error);
          if (!this.shouldRetry(qwenError)) {
            throw qwenError;
          }
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt);
        
        console.warn(
          `Qwen API request failed (attempt ${attempt}/${this.config.maxRetries}), retrying in ${delay}ms...`,
          error instanceof Error ? error.message : error,
        );

        await this.sleep(delay, abortSignal);
      }
    }

    // If we get here, all retries failed
    throw lastError;
  }

  private shouldRetry(error: QwenError): boolean {
    return (
      error.retryable &&
      this.config.retryableErrorTypes.includes(error.type)
    );
  }

  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxDelay);
  }

  private sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error('Sleep aborted'));
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          clearTimeout(timeout);
          reject(new Error('Sleep aborted'));
          return;
        }
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }

      // Clean up abort listener when timeout completes
      timeout && setTimeout(() => {
        abortSignal?.removeEventListener('abort', abortHandler);
      }, ms);
    });
  }
}