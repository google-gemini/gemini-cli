/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Types
export type { StructuredError, ParsedError } from './errorTypes.js';
export { ParsedErrorType, isAuthError } from './errorTypes.js';

// Error classes
export {
  FatalError,
  FatalAuthenticationError,
  FatalInputError,
  FatalSandboxError,
  FatalConfigError,
  FatalTurnLimitedError,
  FatalToolExecutionError,
  FatalCancellationError,
} from './errorTypes.js';

// Functions
export {
  parseError,
  parseAndFormatApiError, // deprecated
  isNodeError,
  getErrorMessage,
  // Compatibility layer
  createFatalError,
  isFatalError,
} from './errorParsing.js';

/**
 * Migration Note: Removed HTTP Error Classes
 *
 * The following error classes have been removed in favor of unified error parsing:
 * - UnauthorizedError (was thrown for 401 errors)
 * - ForbiddenError (was thrown for 403 errors)
 * - BadRequestError (was thrown for 400 errors)
 *
 * Migration example:
 * ```typescript
 * // Old approach (no longer available):
 * try {
 *   await apiCall();
 * } catch (e) {
 *   if (e instanceof UnauthorizedError) {
 *     // handle 401
 *   }
 * }
 *
 * // New approach (use ParsedError):
 * try {
 *   await apiCall();
 * } catch (e) {
 *   const parsed = parseError(e);
 *   if (parsed.statusCode === 401) {
 *     // handle 401
 *   }
 *   // Or use type-safe helpers:
 *   if (isAuthError(parsed)) {
 *     // handles both 401 and 403
 *   }
 * }
 * ```
 */
