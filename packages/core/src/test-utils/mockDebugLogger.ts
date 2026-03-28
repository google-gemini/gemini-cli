/**
 * Test utility for silencing or capturing debugLogger output.
 *
 * Use this in tests that exercise code paths that call debugLogger directly
 * and need to assert on log calls, or in integration tests that need finer
 * control than the global console mocks in test-setup.ts provide.
 *
 * @example - Silence all debugLogger output in a test:
 *   import { mockDebugLogger } from '../test-utils/mockDebugLogger.js';
 *   mockDebugLogger();
 *
 * @example - Assert that a specific message was logged:
 *   const spies = mockDebugLogger();
 *   it('should log a message', () => {
 *     myFunction();
 *     expect(spies.logSpy).toHaveBeenCalledWith('expected message');
 *   });
 */

import { vi, beforeEach, afterEach } from 'vitest';
import { debugLogger } from '../utils/debugLogger.js';

export interface MockedDebugLogger {
  logSpy: ReturnType<typeof vi.spyOn>;
  warnSpy: ReturnType<typeof vi.spyOn>;
  errorSpy: ReturnType<typeof vi.spyOn>;
  debugSpy: ReturnType<typeof vi.spyOn>;
}

/**
 * Installs no-op spies on all debugLogger methods for the current test suite.
 * All spies are automatically restored in afterEach.
 *
 * @returns An object with getters for the installed spies. To prevent issues
 *   with the test lifecycle, do not destructure the returned object. Instead,
 *   access spies via the returned object from within a test body (e.g., `it()`).
 */
export function mockDebugLogger(): MockedDebugLogger {
  let logSpy: ReturnType<typeof vi.spyOn> | undefined;
  let warnSpy: ReturnType<typeof vi.spyOn> | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn> | undefined;
  let debugSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    logSpy = vi.spyOn(debugLogger, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(debugLogger, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
    debugSpy?.mockRestore();
  });

  return {
    get logSpy() {
      if (!logSpy) {
        throw new Error(
          `mockDebugLogger: 'logSpy' is not available. Spies can only be accessed within a test body (e.g., inside 'it()').`,
        );
      }
      return logSpy;
    },
    get warnSpy() {
      if (!warnSpy) {
        throw new Error(
          `mockDebugLogger: 'warnSpy' is not available. Spies can only be accessed within a test body (e.g., inside 'it()').`,
        );
      }
      return warnSpy;
    },
    get errorSpy() {
      if (!errorSpy) {
        throw new Error(
          `mockDebugLogger: 'errorSpy' is not available. Spies can only be accessed within a test body (e.g., inside 'it()').`,
        );
      }
      return errorSpy;
    },
    get debugSpy() {
      if (!debugSpy) {
        throw new Error(
          `mockDebugLogger: 'debugSpy' is not available. Spies can only be accessed within a test body (e.g., inside 'it()').`,
        );
      }
      return debugSpy;
    },
  };
}
