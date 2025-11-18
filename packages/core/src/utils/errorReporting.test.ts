/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reportError } from './errorReporting.js';

// Use a type alias for SpyInstance as it's not directly exported
type SpyInstance = ReturnType<typeof vi.spyOn>;

describe('reportError', () => {
  let consoleErrorSpy: SpyInstance;
  let testDir: string;
  const MOCK_TIMESTAMP = '2025-01-01T00-00-00-000Z';

  beforeEach(async () => {
    // Create a temporary directory for logs
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-report-test-'));
    vi.resetAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(MOCK_TIMESTAMP);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean up the temporary directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  const getExpectedReportPath = (type: string) =>
    path.join(testDir, `gemini-client-error-${type}-${MOCK_TIMESTAMP}.json`);

  it('should generate a report and log the path', async () => {
    const error = new Error('Test error');
    error.stack = 'Test stack';
    const baseMessage = 'An error occurred.';
    const context = { data: 'test context' };
    const type = 'test-type';
    const expectedReportPath = getExpectedReportPath(type);

    await reportError(error, baseMessage, context, type, testDir);

    // Verify the file was written
    const reportContent = await fs.readFile(expectedReportPath, 'utf-8');
    const parsedReport = JSON.parse(reportContent);

    expect(parsedReport).toEqual({
      error: { message: 'Test error', stack: 'Test stack' },
      context,
    });

    // Verify the console log
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });

  it('should handle errors that are plain objects with a message property', async () => {
    const error = { message: 'Test plain object error' };
    const baseMessage = 'Another error.';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    await reportError(error, baseMessage, undefined, type, testDir);

    const reportContent = await fs.readFile(expectedReportPath, 'utf-8');
    const parsedReport = JSON.parse(reportContent);

    expect(parsedReport).toEqual({
      error: { message: 'Test plain object error' },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });

  it('should handle string errors', async () => {
    const error = 'Just a string error';
    const baseMessage = 'String error occurred.';
    const type = 'general';
    const expectedReportPath = getExpectedReportPath(type);

    await reportError(error, baseMessage, undefined, type, testDir);

    const reportContent = await fs.readFile(expectedReportPath, 'utf-8');
    const parsedReport = JSON.parse(reportContent);

    expect(parsedReport).toEqual({
      error: { message: 'Just a string error' },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });

  it('should log fallback message if writing report fails', async () => {
    const error = new Error('Main error');
    const baseMessage = 'Failed operation.';
    const context = ['some context'];
    const type = 'general';
    const nonExistentDir = path.join(testDir, 'non-existent-dir');

    await reportError(error, baseMessage, context, type, nonExistentDir);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Additionally, failed to write detailed error report:`,
      expect.any(Error), // The actual write error
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

    await reportError(error, baseMessage, context, type, testDir);

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

    // Check that it writes a minimal report
    const reportContent = await fs.readFile(expectedMinimalReportPath, 'utf-8');
    const parsedReport = JSON.parse(reportContent);
    expect(parsedReport).toEqual({
      error: { message: error.message, stack: error.stack },
    });

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

    await reportError(error, baseMessage, undefined, type, testDir);

    const reportContent = await fs.readFile(expectedReportPath, 'utf-8');
    const parsedReport = JSON.parse(reportContent);

    expect(parsedReport).toEqual({
      error: { message: 'Error without context', stack: 'No context stack' },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `${baseMessage} Full report available at: ${expectedReportPath}`,
    );
  });
});
