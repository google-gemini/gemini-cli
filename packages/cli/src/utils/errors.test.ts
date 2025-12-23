/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  type MockInstance,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import type { Config } from '@google/gemini-cli-core';
import {
  OutputFormat,
  FatalInputError,
  debugLogger,
  coreEvents,
} from '@google/gemini-cli-core';
import {
  getErrorMessage,
  handleError,
  handleToolError,
  handleCancellationError,
  handleMaxTurnsExceededError,
} from './errors.js';
import { runSyncCleanup } from './cleanup.js';

// Mock the cleanup module
vi.mock('./cleanup.js', () => ({
  runSyncCleanup: vi.fn(),
}));

// Mock the core modules
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    parseAndFormatApiError: vi.fn((error: unknown) => {
      if (error instanceof Error) {
        return `API Error: ${error.message}`;
      }
      return `API Error: ${String(error)}`;
    }),
    JsonFormatter: vi.fn().mockImplementation(() => ({
      formatError: vi.fn(
        (error: Error, code?: string | number, sessionId?: string) =>
          JSON.stringify(
            {
              ...(sessionId && { session_id: sessionId }),
              error: {
                type: error.constructor.name,
                message: error.message,
                ...(code && { code }),
              },
            },
            null,
            2,
          ),
      ),
    })),
    StreamJsonFormatter: vi.fn().mockImplementation(() => ({
      emitEvent: vi.fn(),
      convertToStreamStats: vi.fn().mockReturnValue({
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        cached: 0,
        input: 0,
        duration_ms: 0,
        tool_calls: 0,
      }),
    })),
    uiTelemetryService: {
      getMetrics: vi.fn().mockReturnValue({}),
    },
    JsonStreamEventType: {
      RESULT: 'result',
    },
    coreEvents: {
      emitFeedback: vi.fn(),
    },
    FatalToolExecutionError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'FatalToolExecutionError';
        this.exitCode = 54;
      }
      exitCode: number;
    },
    FatalCancellationError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'FatalCancellationError';
        this.exitCode = 130;
      }
      exitCode: number;
    },
  };
});

describe('errors', () => {
  let mockConfig: Config;
  let processExitSpy: MockInstance;
  let debugLoggerErrorSpy: MockInstance;
  let debugLoggerWarnSpy: MockInstance;
  let coreEventsEmitFeedbackSpy: MockInstance;
  let runSyncCleanupSpy: MockInstance;

  const TEST_SESSION_ID = 'test-session-123';

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock debugLogger
    debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});
    debugLoggerWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});

    // Mock coreEvents
    coreEventsEmitFeedbackSpy = vi.mocked(coreEvents.emitFeedback);

    // Mock runSyncCleanup
    runSyncCleanupSpy = vi.mocked(runSyncCleanup);

    // Mock process.exit to throw instead of actually exiting
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit called with code: ${code}`);
    });

    // Create mock config
    mockConfig = {
      getOutputFormat: vi.fn().mockReturnValue(OutputFormat.TEXT),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'test' }),
      getSessionId: vi.fn().mockReturnValue(TEST_SESSION_ID),
    } as unknown as Config;
  });

  afterEach(() => {
    debugLoggerErrorSpy.mockRestore();
    debugLoggerWarnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('getErrorMessage', () => {
    it('should return error message for Error instances', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should convert non-Error values to strings', () => {
      expect(getErrorMessage('string error')).toBe('string error');
      expect(getErrorMessage(123)).toBe('123');
      expect(getErrorMessage(null)).toBe('null');
      expect(getErrorMessage(undefined)).toBe('undefined');
    });

    it('should handle objects', () => {
      const obj = { message: 'test' };
      expect(getErrorMessage(obj)).toBe('[object Object]');
    });
  });

  describe('handleError', () => {
    describe('in text mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.TEXT);
      });

      it('should re-throw without logging to debugLogger', () => {
        const testError = new Error('Test error');

        expect(() => {
          handleError(testError, mockConfig);
        }).toThrow(testError);

        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
      });

      it('should handle non-Error objects', () => {
        const testError = 'String error';

        expect(() => {
          handleError(testError, mockConfig);
        }).toThrow(testError);
      });
    });

    describe('in JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.JSON);
      });

      it('should format error as JSON, emit feedback exactly once, and exit with default code', () => {
        const testError = new Error('Test error');

        expect(() => {
          handleError(testError, mockConfig);
        }).toThrow('process.exit called with code: 1');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          JSON.stringify(
            {
              session_id: TEST_SESSION_ID,
              error: {
                type: 'Error',
                message: 'Test error',
                code: 1,
              },
            },
            null,
            2,
          ),
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
        expect(runSyncCleanupSpy).toHaveBeenCalled();
      });

      it('should use custom error code when provided and only surface once', () => {
        const testError = new Error('Test error');

        expect(() => {
          handleError(testError, mockConfig, 42);
        }).toThrow('process.exit called with code: 42');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          JSON.stringify(
            {
              session_id: TEST_SESSION_ID,
              error: {
                type: 'Error',
                message: 'Test error',
                code: 42,
              },
            },
            null,
            2,
          ),
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
      });

      it('should extract exitCode from FatalError instances and only surface once', () => {
        const fatalError = new FatalInputError('Fatal error');

        expect(() => {
          handleError(fatalError, mockConfig);
        }).toThrow('process.exit called with code: 42');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          JSON.stringify(
            {
              session_id: TEST_SESSION_ID,
              error: {
                type: 'FatalInputError',
                message: 'Fatal error',
                code: 42,
              },
            },
            null,
            2,
          ),
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
      });

      it('should handle error with code property', () => {
        const errorWithCode = new Error('Error with code') as Error & {
          code: number;
        };
        errorWithCode.code = 404;

        expect(() => {
          handleError(errorWithCode, mockConfig);
        }).toThrow('process.exit called with code: 404');
      });

      it('should handle error with status property', () => {
        const errorWithStatus = new Error('Error with status') as Error & {
          status: string;
        };
        errorWithStatus.status = 'TIMEOUT';

        expect(() => {
          handleError(errorWithStatus, mockConfig);
        }).toThrow('process.exit called with code: 1'); // string codes become 1

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          JSON.stringify(
            {
              session_id: TEST_SESSION_ID,
              error: {
                type: 'Error',
                message: 'Error with status',
                code: 'TIMEOUT',
              },
            },
            null,
            2,
          ),
        );
      });
    });

    describe('in STREAM_JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.STREAM_JSON);
      });

      it('should emit result event, run cleanup, and exit', () => {
        const testError = new Error('Test error');

        expect(() => {
          handleError(testError, mockConfig);
        }).toThrow('process.exit called with code: 1');

        expect(runSyncCleanupSpy).toHaveBeenCalled();
      });

      it('should extract exitCode from FatalError instances', () => {
        const fatalError = new FatalInputError('Fatal error');

        expect(() => {
          handleError(fatalError, mockConfig);
        }).toThrow('process.exit called with code: 42');
      });
    });
  });

  describe('handleToolError', () => {
    const toolName = 'test-tool';
    const toolError = new Error('Tool failed');

    describe('in text mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.TEXT);
      });

      it('should log error message to stderr (via debugLogger) for non-fatal', () => {
        handleToolError(toolName, toolError, mockConfig);

        expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
          'Error executing tool test-tool: Tool failed',
        );
      });

      it('should use resultDisplay when provided', () => {
        handleToolError(
          toolName,
          toolError,
          mockConfig,
          'CUSTOM_ERROR',
          'Custom display message',
        );

        expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
          'Error executing tool test-tool: Custom display message',
        );
      });

      it('should emit feedback exactly once for fatal errors and not use debugLogger', () => {
        expect(() => {
          handleToolError(toolName, toolError, mockConfig, 'no_space_left');
        }).toThrow('process.exit called with code: 54');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          'Error executing tool test-tool: Tool failed',
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
        expect(runSyncCleanupSpy).toHaveBeenCalled();
      });
    });

    describe('in JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.JSON);
      });

      describe('non-fatal errors', () => {
        it('should log error message to stderr without exiting for recoverable errors', () => {
          handleToolError(
            toolName,
            toolError,
            mockConfig,
            'invalid_tool_params',
          );

          expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
            'Error executing tool test-tool: Tool failed',
          );
          // Should not exit for non-fatal errors
          expect(processExitSpy).not.toHaveBeenCalled();
          expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled();
        });

        it('should not exit for file not found errors', () => {
          handleToolError(toolName, toolError, mockConfig, 'file_not_found');

          expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
            'Error executing tool test-tool: Tool failed',
          );
          expect(processExitSpy).not.toHaveBeenCalled();
          expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled();
        });

        it('should not exit for permission denied errors', () => {
          handleToolError(toolName, toolError, mockConfig, 'permission_denied');

          expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
            'Error executing tool test-tool: Tool failed',
          );
          expect(processExitSpy).not.toHaveBeenCalled();
          expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled();
        });

        it('should not exit for path not in workspace errors', () => {
          handleToolError(
            toolName,
            toolError,
            mockConfig,
            'path_not_in_workspace',
          );

          expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
            'Error executing tool test-tool: Tool failed',
          );
          expect(processExitSpy).not.toHaveBeenCalled();
          expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled();
        });

        it('should prefer resultDisplay over error message', () => {
          handleToolError(
            toolName,
            toolError,
            mockConfig,
            'invalid_tool_params',
            'Display message',
          );

          expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
            'Error executing tool test-tool: Display message',
          );
          expect(processExitSpy).not.toHaveBeenCalled();
        });
      });

      describe('fatal errors', () => {
        it('should exit immediately for NO_SPACE_LEFT errors and only surface once', () => {
          expect(() => {
            handleToolError(toolName, toolError, mockConfig, 'no_space_left');
          }).toThrow('process.exit called with code: 54');

          expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
          expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
            'error',
            JSON.stringify(
              {
                session_id: TEST_SESSION_ID,
                error: {
                  type: 'FatalToolExecutionError',
                  message: 'Error executing tool test-tool: Tool failed',
                  code: 'no_space_left',
                },
              },
              null,
              2,
            ),
          );
          expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
          expect(runSyncCleanupSpy).toHaveBeenCalled();
        });
      });
    });

    describe('in STREAM_JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.STREAM_JSON);
      });

      it('should emit result event, run cleanup, and exit for fatal errors', () => {
        expect(() => {
          handleToolError(toolName, toolError, mockConfig, 'no_space_left');
        }).toThrow('process.exit called with code: 54');
        expect(runSyncCleanupSpy).toHaveBeenCalled();
        expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled(); // Stream mode uses emitEvent
      });

      it('should log to stderr and not exit for non-fatal errors', () => {
        handleToolError(toolName, toolError, mockConfig, 'invalid_tool_params');
        expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
          'Error executing tool test-tool: Tool failed',
        );
        expect(processExitSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleCancellationError', () => {
    describe('in text mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.TEXT);
      });

      it('should emit feedback exactly once, run cleanup, and exit with 130', () => {
        expect(() => {
          handleCancellationError(mockConfig);
        }).toThrow('process.exit called with code: 130');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          'Operation cancelled.',
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
        expect(runSyncCleanupSpy).toHaveBeenCalled();
      });
    });

    describe('in JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.JSON);
      });

      it('should format cancellation as JSON, emit feedback once, and exit with 130', () => {
        expect(() => {
          handleCancellationError(mockConfig);
        }).toThrow('process.exit called with code: 130');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          JSON.stringify(
            {
              session_id: TEST_SESSION_ID,
              error: {
                type: 'FatalCancellationError',
                message: 'Operation cancelled.',
                code: 130,
              },
            },
            null,
            2,
          ),
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
      });
    });

    describe('in STREAM_JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.STREAM_JSON);
      });

      it('should emit result event and exit with 130', () => {
        expect(() => {
          handleCancellationError(mockConfig);
        }).toThrow('process.exit called with code: 130');
        expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleMaxTurnsExceededError', () => {
    describe('in text mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.TEXT);
      });

      it('should emit feedback exactly once, run cleanup, and exit with 53', () => {
        expect(() => {
          handleMaxTurnsExceededError(mockConfig);
        }).toThrow('process.exit called with code: 53');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
        expect(runSyncCleanupSpy).toHaveBeenCalled();
      });
    });

    describe('in JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.JSON);
      });

      it('should format max turns error as JSON, emit feedback once, and exit with 53', () => {
        expect(() => {
          handleMaxTurnsExceededError(mockConfig);
        }).toThrow('process.exit called with code: 53');

        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledTimes(1);
        expect(coreEventsEmitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          JSON.stringify(
            {
              session_id: TEST_SESSION_ID,
              error: {
                type: 'FatalTurnLimitedError',
                message:
                  'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
                code: 53,
              },
            },
            null,
            2,
          ),
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
      });
    });

    describe('in STREAM_JSON mode', () => {
      beforeEach(() => {
        (
          mockConfig.getOutputFormat as ReturnType<typeof vi.fn>
        ).mockReturnValue(OutputFormat.STREAM_JSON);
      });

      it('should emit result event and exit with 53', () => {
        expect(() => {
          handleMaxTurnsExceededError(mockConfig);
        }).toThrow('process.exit called with code: 53');
        expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled();
      });
    });
  });
});
