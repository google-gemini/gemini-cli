/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../core/contentGenerator.js';
import {
  isProQuotaExceededError,
  isGenericQuotaExceededError,
} from './quotaErrorDetection.js';
import { retryConfigManager, RetryConfigManager } from './retryConfig.js';
import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

export interface ApiHttpError extends Error {
  status?: number;
  code?: string | number;
  response?: {
    status?: number;
    data?: unknown;
    headers?: Record<string, string>;
  };
}

export interface ApiRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  operation: string;
  authType?: AuthType;
  onPersistent429?: (
    authType?: string,
    error?: unknown,
  ) => Promise<string | boolean | null>;
  enableDebugLogging?: boolean;
}

const DEFAULT_OPTIONS: Partial<ApiRetryOptions> = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  enableDebugLogging: true,
};

/**
 * Production-grade API retry client with intelligent backoff strategies
 * and comprehensive error handling for both interactive and non-interactive modes.
 */
export class ApiRetryClient {
  private options: ApiRetryOptions;
  private debugLogPath: string;
  private configManager: RetryConfigManager;

  constructor(options: Partial<ApiRetryOptions> = {}) {
    this.configManager = retryConfigManager;
    const config = this.configManager.getConfig();
    
    // Merge user options with configuration manager settings
    this.options = {
      maxRetries: options.maxRetries ?? config.maxRetries,
      baseDelayMs: options.baseDelayMs ?? config.baseDelayMs,
      maxDelayMs: options.maxDelayMs ?? config.maxDelayMs,
      operation: options.operation || 'API_CALL',
      authType: options.authType,
      onPersistent429: options.onPersistent429,
      enableDebugLogging: options.enableDebugLogging ?? config.enableDebugLogging,
    };
    
    this.debugLogPath = join(process.cwd(), '.gemini-cli-debug.log');
    
    // Initialize debug log if enabled
    if (this.options.enableDebugLogging) {
      this.initializeDebugLog();
    }
  }

  /**
   * Execute a request with intelligent retry logic and exponential backoff
   */
  async makeRequest<T>(
    requestFn: () => Promise<T>,
    operation: string = 'API_CALL'
  ): Promise<T> {
    let lastError: any;
    let consecutive429Count = 0;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        // Show retry progress for attempts after the first
        if (attempt > 0) {
          const delay = this.calculateBackoff(attempt - 1, lastError);
          await this.showRetryProgress(attempt, delay, operation);
          await this.sleep(delay);
        }

        return await requestFn();
      } catch (error) {
        lastError = error;
        const errorStatus = this.getErrorStatus(error);

        // Handle Pro quota exceeded errors immediately for OAuth users
        if (
          errorStatus === 429 &&
          this.options.authType === AuthType.LOGIN_WITH_GOOGLE &&
          isProQuotaExceededError(error) &&
          this.options.onPersistent429
        ) {
          try {
            const fallbackResult = await this.options.onPersistent429(this.options.authType, error);
            if (fallbackResult !== false && fallbackResult !== null) {
              // Reset counters and try with new model
              attempt = -1; // Will be incremented to 0 in next iteration
              consecutive429Count = 0;
              continue;
            } else {
              // Fallback handler said stop retrying
              this.handleFinalError(error, operation, attempt + 1);
              throw error;
            }
          } catch (fallbackError) {
            console.warn('Fallback to alternative model failed:', fallbackError);
          }
        }

        // Handle generic quota exceeded errors for OAuth users
        if (
          errorStatus === 429 &&
          this.options.authType === AuthType.LOGIN_WITH_GOOGLE &&
          !isProQuotaExceededError(error) &&
          isGenericQuotaExceededError(error) &&
          this.options.onPersistent429
        ) {
          try {
            const fallbackResult = await this.options.onPersistent429(this.options.authType, error);
            if (fallbackResult !== false && fallbackResult !== null) {
              // Reset counters and try with new model
              attempt = -1; // Will be incremented to 0 in next iteration
              consecutive429Count = 0;
              continue;
            } else {
              // Fallback handler said stop retrying
              this.handleFinalError(error, operation, attempt + 1);
              throw error;
            }
          } catch (fallbackError) {
            console.warn('Fallback to alternative model failed:', fallbackError);
          }
        }

        // Track consecutive 429 errors
        if (errorStatus === 429) {
          consecutive429Count++;
        } else {
          consecutive429Count = 0;
        }

        // Handle persistent 429s with fallback for OAuth users
        if (
          consecutive429Count >= 2 &&
          this.options.onPersistent429 &&
          this.options.authType === AuthType.LOGIN_WITH_GOOGLE
        ) {
          try {
            const fallbackResult = await this.options.onPersistent429(this.options.authType, error);
            if (fallbackResult !== false && fallbackResult !== null) {
              // Reset counters and try with new model
              attempt = -1; // Will be incremented to 0 in next iteration
              consecutive429Count = 0;
              continue;
            } else {
              // Fallback handler said stop retrying
              this.handleFinalError(error, operation, attempt + 1);
              throw error;
            }
          } catch (fallbackError) {
            console.warn('Fallback to alternative model failed:', fallbackError);
          }
        }

        // Check if we should stop retrying
        if (attempt >= this.options.maxRetries || !this.shouldRetry(error)) {
          this.handleFinalError(error, operation, attempt + 1);
          throw error;
        }

        // Log retry attempt for debugging
        this.logRetryAttempt(error, attempt + 1, operation);
      }
    }

    // This should be unreachable due to throw in catch block
    throw lastError;
  }

  /**
   * Determine if an error should trigger a retry attempt
   */
  private shouldRetry(error: any): boolean {
    const status = this.getErrorStatus(error);
    const code = error?.code;
    
    // Retry on: 429 (rate limit), 500+ (server errors), network timeouts
    const retryableStatuses = [429, 500, 502, 503, 504];
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
    
    return (status !== undefined && retryableStatuses.includes(status)) || retryableCodes.includes(code);
  }

  /**
   * Calculate backoff delay based on attempt number and error type using configuration
   */
  private calculateBackoff(attempt: number, error: any): number {
    const status = this.getErrorStatus(error);
    
    // Check for Retry-After header first
    const retryAfterMs = this.getRetryAfterDelayMs(error);
    if (retryAfterMs > 0) {
      return Math.min(retryAfterMs, this.options.maxDelayMs);
    }
    
    // Use configuration manager for intelligent delay calculation
    if (status === 429) {
      return this.configManager.getDelayForError('rateLimit', attempt);
    } else if (status && status >= 500) {
      return this.configManager.getDelayForError('serverError', attempt);
    } else if (this.isNetworkError(error)) {
      return this.configManager.getDelayForError('networkError', attempt);
    }
    
    // Default fallback
    return Math.min(this.options.baseDelayMs * (attempt + 1), this.options.maxDelayMs);
  }

  /**
   * Show retry progress in both interactive and non-interactive modes
   */
  private async showRetryProgress(attempt: number, delayMs: number, operation: string): Promise<void> {
    const config = this.configManager.getConfig();
    const delaySec = Math.round(delayMs / 1000);
    
    let msg: string;
    if (config.verboseRetries) {
      msg = `[*] ${operation} failed, retrying in ${delaySec}s... (attempt ${attempt}/${this.options.maxRetries}) [Strategy: ${this.getRetryStrategy(operation)}]`;
    } else {
      msg = `[*] ${operation} failed, retrying in ${delaySec}s... (attempt ${attempt}/${this.options.maxRetries})`;
    }
    
    // Show progress appropriately for the environment
    if (process.stderr.isTTY) {
      // Interactive mode - use stderr to avoid interfering with stdout
      process.stderr.write(`\r${msg}`);
    } else {
      // Non-interactive mode - log to stderr for CI/automation visibility
      console.error(msg);
    }
  }

  /**
   * Get retry strategy description for verbose mode
   */
  private getRetryStrategy(operation: string): string {
    const config = this.configManager.getConfig();
    if (operation.includes('429') || operation.includes('RATE')) {
      return config.retryStrategies.rateLimitBackoff;
    } else if (operation.includes('5')) {
      return config.retryStrategies.serverErrorBackoff;
    } else {
      return config.retryStrategies.networkErrorBackoff;
    }
  }

  /**
   * Check if error is a network-related error
   */
  private isNetworkError(error: any): boolean {
    const code = error?.code;
    const networkCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH'];
    return networkCodes.includes(code);
  }

  /**
   * Extract HTTP status code from various error formats
   */
  private getErrorStatus(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
      // Direct status property
      if ('status' in error && typeof (error as any).status === 'number') {
        return (error as any).status;
      }
      
      // Axios-style error.response.status
      if ('response' in error && typeof (error as any).response === 'object') {
        const response = (error as any).response;
        if (response && 'status' in response && typeof response.status === 'number') {
          return response.status;
        }
      }
    }
    return undefined;
  }

  /**
   * Extract Retry-After header delay from error
   */
  private getRetryAfterDelayMs(error: unknown): number {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const response = (error as any).response;
      if (response && 'headers' in response && typeof response.headers === 'object') {
        const retryAfter = response.headers['retry-after'] || response.headers['Retry-After'];
        if (typeof retryAfter === 'string') {
          const seconds = parseInt(retryAfter, 10);
          if (!isNaN(seconds)) {
            return seconds * 1000;
          }
          
          // Try parsing as HTTP date
          const retryDate = new Date(retryAfter);
          if (!isNaN(retryDate.getTime())) {
            return Math.max(0, retryDate.getTime() - Date.now());
          }
        }
      }
    }
    return 0;
  }

  /**
   * Log retry attempt details for debugging
   */
  private logRetryAttempt(error: any, attempt: number, operation: string): void {
    if (!this.options.enableDebugLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      attempt,
      maxRetries: this.options.maxRetries,
      error: {
        status: this.getErrorStatus(error),
        code: error?.code,
        message: error?.message,
        // Only include response data if it's not too large
        responseData: this.sanitizeResponseData(error?.response?.data)
      },
      authType: this.options.authType
    };
    
    try {
      appendFileSync(this.debugLogPath, JSON.stringify(logEntry) + '\n');
    } catch (logError) {
      // Don't let logging errors break the retry process
      console.warn('Failed to write debug log:', logError);
    }
  }

  /**
   * Handle final error after all retries exhausted
   */
  private handleFinalError(error: any, operation: string, totalAttempts: number): void {
    const errorFormatter = new ErrorFormatter();
    errorFormatter.displayFinalError(error, operation, totalAttempts);
  }

  /**
   * Initialize debug log file
   */
  private initializeDebugLog(): void {
    try {
      const initEntry = {
        timestamp: new Date().toISOString(),
        event: 'RETRY_CLIENT_INITIALIZED',
        options: {
          maxRetries: this.options.maxRetries,
          baseDelayMs: this.options.baseDelayMs,
          maxDelayMs: this.options.maxDelayMs,
          authType: this.options.authType
        }
      };
      writeFileSync(this.debugLogPath, JSON.stringify(initEntry) + '\n');
    } catch (error) {
      // Silently fail - don't break the application for logging issues
    }
  }

  /**
   * Sanitize response data for logging (remove sensitive info, limit size)
   */
  private sanitizeResponseData(data: unknown): unknown {
    if (!data) return null;
    
    try {
      const dataStr = JSON.stringify(data);
      // Limit log entry size to prevent huge debug files
      if (dataStr.length > 1000) {
        return dataStr.substring(0, 1000) + '... [truncated]';
      }
      return data;
    } catch {
      return '[non-serializable data]';
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Enhanced error formatter for consistent error display across all CLI modes
 */
export class ErrorFormatter {
  displayFinalError(error: any, operation: string, attempts: number): void {
    const status = this.getErrorStatus(error);
    let userMessage = `\n[X] ${operation} failed after ${attempts} attempts.\n`;
    
    if (status === 429 || this.isQuotaError(error)) {
      userMessage += this.getQuotaErrorMessage(error);
    } else if (status !== undefined && status >= 500) {
      userMessage += this.getServerErrorMessage(status);
    } else if (this.isNetworkError(error)) {
      userMessage += this.getNetworkErrorMessage(error);
    } else {
      userMessage += this.getGenericErrorMessage(error, status);
    }
    
    // Always output to stderr for proper error handling
    console.error(userMessage);
    
    // Set proper exit code for automation/CI
    if (!process.exitCode) {
      process.exitCode = 1;
    }
  }

  private getQuotaErrorMessage(error: any): string {
    return `
    ** API Quota Exceeded **
    You've hit your request limit for the Gemini API.

    ** Next Steps **
    1. Upgrade your quota: https://aistudio.google.com/apikey
    2. Request limit increase: https://ai.google.dev/gemini-api/docs/rate-limits#request-rate-limit-increase
    3. Try again later (quota resets at midnight UTC)
    4. Switch to a different model with /model command

    ** Pro Tip ** Use --model=gemini-2.5-flash instead of gemini-2.5-pro to conserve quota.`;
  }

  private getServerErrorMessage(status?: number): string {
    const statusCode = status || 'Unknown';
    return `
    ** Server Error (${statusCode}) **
    Gemini API is experiencing issues. This is usually temporary.

    ** Try Again **
    - Wait a few minutes and retry your request
    - Check API status: https://status.cloud.google.com/
    - Switch to a different model if available
    - Use /auth to try a different authentication method`;
  }

  private getNetworkErrorMessage(error: any): string {
    const code = error?.code || 'NETWORK_ERROR';
    return `
    ** Network Error (${code}) **
    Unable to connect to the Gemini API.

    ** Troubleshooting **
    - Check your internet connection
    - Verify firewall/proxy settings
    - Try again in a few moments
    - Check if you're behind a corporate firewall`;
  }

  private getGenericErrorMessage(error: any, status?: number): string {
    const message = error?.message || 'Unknown error occurred';
    return `
    ** Error Details **
    Status: ${status || 'Unknown'}
    Message: ${message}

    ** Debug Info ** 
    Check .gemini-cli-debug.log for technical details
    Use /bug command to report this issue if it persists`;
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
      if ('status' in error && typeof (error as any).status === 'number') {
        return (error as any).status;
      }
      if ('response' in error && typeof (error as any).response === 'object') {
        const response = (error as any).response;
        if (response && 'status' in response && typeof response.status === 'number') {
          return response.status;
        }
      }
    }
    return undefined;
  }

  private isQuotaError(error: any): boolean {
    const message = error?.message || '';
    return message.includes('quota') || 
           message.includes('Quota') || 
           message.includes('limit') ||
           isProQuotaExceededError(error) ||
           isGenericQuotaExceededError(error);
  }

  private isNetworkError(error: any): boolean {
    const code = error?.code;
    const networkCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH'];
    return networkCodes.includes(code);
  }
}
