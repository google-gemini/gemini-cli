/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Testing utilities for simulating 429 errors in unit tests
 */

import { debugLogger } from './debugLogger.js';

let requestCounter = 0;
let simulate429Enabled = false;
let simulate429AfterRequests = 0;
let simulate429ForAuthType: string | undefined;
let fallbackOccurred = false;

let processStartTime: number | undefined;
let hasLoggedExpiration = false;

/**
 * Resets the slow server simulation timer.
 * Used to simulate a server that becomes unreliable again after a successful response.
 */
export function resetSlowServerSimulation(caller?: string): void {
  if (processStartTime !== undefined) {
    processStartTime = undefined;
    hasLoggedExpiration = false;
    debugLogger.debug(
      `[DEBUG] Slow server simulation RESET (by ${caller || 'unknown'})`,
    );
  }
}

/**
 * Check if we should simulate a slow server returning 429s.
 * This is driven by the SIMULATE_SLOW_GEMINI_CLI_SERVER or SIMILATE_SLOW_GEMINI_CLI_SERVER
 * environment variable which specifies the duration in seconds for which 429s should be returned.
 */
export function shouldSimulateSlowServer(): boolean {
  const simulateWithU = process.env['SIMULATE_SLOW_GEMINI_CLI_SERVER'];
  const simulateWithI = process.env['SIMILATE_SLOW_GEMINI_CLI_SERVER'];
  const slowServerEnv = simulateWithU || simulateWithI;

  if (!slowServerEnv) {
    return false;
  }

  if (processStartTime === undefined) {
    processStartTime = Date.now();
    debugLogger.debug(
      `[DEBUG] Slow server simulation STARTED (limit: ${slowServerEnv}s)`,
    );
  }

  const durationSeconds = parseInt(slowServerEnv.trim(), 10);
  if (isNaN(durationSeconds)) {
    debugLogger.debug(
      `[DEBUG] Slow server simulation env var found but invalid: ${slowServerEnv}`,
    );
    return false;
  }
  const elapsedSeconds = (Date.now() - processStartTime) / 1000;
  const shouldSimulate = elapsedSeconds < durationSeconds;
  if (shouldSimulate) {
    debugLogger.debug(
      `[DEBUG] Simulating 429 error (elapsed: ${elapsedSeconds.toFixed(1)}s, limit: ${durationSeconds}s, env: ${simulateWithU ? 'SIMULATE' : 'SIMILATE'})`,
    );
  } else {
    // Log once when simulation expires to help debug
    if (!hasLoggedExpiration) {
      debugLogger.debug(
        `[DEBUG] Slow server simulation EXPIRED (elapsed: ${elapsedSeconds.toFixed(1)}s, limit: ${durationSeconds}s)`,
      );
      hasLoggedExpiration = true;
    }
  }
  return shouldSimulate;
}

/**
 * Check if we should simulate a 429 error for the current request
 */
export function shouldSimulate429(authType?: string): boolean {
  if (shouldSimulateSlowServer()) {
    return true;
  }

  if (!simulate429Enabled || fallbackOccurred) {
    return false;
  }

  // If auth type filter is set, only simulate for that auth type
  if (simulate429ForAuthType && authType !== simulate429ForAuthType) {
    return false;
  }

  requestCounter++;

  // If afterRequests is set, only simulate after that many requests
  if (simulate429AfterRequests > 0) {
    return requestCounter > simulate429AfterRequests;
  }

  // Otherwise, simulate for every request
  return true;
}

/**
 * Reset the request counter (useful for tests)
 */
export function resetRequestCounter(): void {
  requestCounter = 0;
}

/**
 * Disable 429 simulation after successful fallback
 */
export function disableSimulationAfterFallback(): void {
  fallbackOccurred = true;
}

/**
 * Create a simulated 429 error response
 */
export function createSimulated429Error(): Error {
  const error = new Error('Rate limit exceeded (simulated)') as Error & {
    status: number;
  };
  error.status = 429;
  return error;
}

/**
 * Reset simulation state when switching auth methods
 */
export function resetSimulationState(): void {
  fallbackOccurred = false;
  resetRequestCounter();
}

/**
 * Enable/disable 429 simulation programmatically (for tests)
 */
export function setSimulate429(
  enabled: boolean,
  afterRequests = 0,
  forAuthType?: string,
): void {
  simulate429Enabled = enabled;
  simulate429AfterRequests = afterRequests;
  simulate429ForAuthType = forAuthType;
  fallbackOccurred = false; // Reset fallback state when simulation is re-enabled
  resetRequestCounter();
}
