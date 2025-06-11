/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// Use a type alias for SpyInstance as it's not directly exported
type SpyInstance = ReturnType<typeof vi.spyOn>;
import { reportError } from './errorReporting.js';
import fs from 'node:fs/promises';
import os from 'node:os';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('node:os');

describe('reportError', () => {
  let consoleErrorSpy: SpyInstance;
  const MOCK_TMP_DIR = '/tmp';
  const MOCK_TIMESTAMP = '2025-01-01T00-00-00-000Z';

  beforeEach(() => {
    vi.resetAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (os.tmpdir as Mock).mockReturnValue(MOCK_TMP_DIR);
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(MOCK_TIMESTAMP);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getExpectedReportPath = (type: string) =>
    `${MOCK_TMP_DIR}/gemini-client-error-${type}-${MOCK_TIMESTAMP}.json`;

  it('should generate a report and log the path', async () => {
    const error = new Error('Test error');
    error.stack = 'Test stack';
    const baseMessage = 'An error occurred.';
    const context = { data: 'test context' };
    const type = 'test-type';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);

    await reportError(error, baseMessage, context, type);

    expect(os.tmpdir).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: 'Test error', stack: error.stack },
          context,
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });

  it('should handle errors that are plain objects with a message property', async () => {
    const error = { message: 'Test plain object error' };
    const baseMessage = 'Another error.';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);
    await reportError(error, baseMessage);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: 'Test plain object error' },
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });

  it('should handle string errors', async () => {
    const error = 'Just a string error';
    const baseMessage = 'String error occurred.';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);
    await reportError(error, baseMessage);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: 'Just a string error' },
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });

  it('should log fallback message if writing report fails', async () => {
    const error = new Error('Main error');
    const baseMessage = 'Failed operation.';
    const writeError = new Error('Failed to write file');
    const context = ['some context'];
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockRejectedValue(writeError);

    await reportError(error, baseMessage, context, type);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      expect.any(String),
    ); // It still tries to write
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Additionally, failed to write detailed error report:`,
      writeError,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Original error that triggered report generation:',
      error,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('Original context:', context);
  });

  it('should handle stringification failure of report content (e.g. BigInt in context)', async () => {
    const error = new Error('Main error');
    error.stack = 'Main stack';
    const baseMessage = 'Failed operation with BigInt.';
    const context = { a: BigInt(1) }; // BigInt cannot be stringified by JSON.stringify
    const type = 'bigint-fail';
    const stringifyError = new TypeError(
      'Do not know how to serialize a BigInt',
    );
    const expectedMinimalReportPath = getExpectedReportPath(type);

    // Simulate JSON.stringify throwing an error for the full report
    const originalJsonStringify = JSON.stringify;
    let callCount = 0;
    vi.spyOn(JSON, 'stringify').mockImplementation((value, replacer, space) => {
      callCount++;
      if (callCount === 1) {
        // First call is for the full report content
        throw stringifyError;
      }
      // Subsequent calls (for minimal report) should succeed
      return originalJsonStringify(value, replacer, space);
    });

    (fs.writeFile as Mock).mockResolvedValue(undefined); // Mock for the minimal report write

    await reportError(error, baseMessage, context, type);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Could not stringify report content (likely due to context):`,
      stringifyError,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Original error that triggered report generation:',
      error,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Original context could not be stringified or included in report.',
    );
    // Check that it attempts to write a minimal report
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedMinimalReportPath,
      originalJsonStringify(
        { error: { message: error.message, stack: error.stack } },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Partial report (excluding context) available at: ${expectedMinimalReportPath}`,
    );
  });

  it('should generate a report without context if context is not provided', async () => {
    const error = new Error('Error without context');
    error.stack = 'No context stack';
    const baseMessage = 'Simple error.';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    (fs.writeFile as Mock).mockResolvedValue(undefined);
    await reportError(error, baseMessage, undefined, type);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedReportPath,
      JSON.stringify(
        {
          error: { message: 'Error without context', stack: error.stack },
        },
        null,
        2,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });
});
