/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debugLogger } from './debugLogger.js';

describe('DebugLogger', () => {
  // Spy on all console methods before each test
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  // Restore original console methods after each test
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call console.log with the correct arguments', () => {
    const message = 'This is a log message';
    const data = { key: 'value' };
    debugLogger.log(message, data);
    expect(console.log).toHaveBeenCalledWith(message, data);
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('should call console.warn with the correct arguments', () => {
    const message = 'This is a warning message';
    const data = [1, 2, 3];
    debugLogger.warn(message, data);
    expect(console.warn).toHaveBeenCalledWith(message, data);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('should call console.error with the correct arguments', () => {
    const message = 'This is an error message';
    const error = new Error('Something went wrong');
    debugLogger.error(message, error);
    expect(console.error).toHaveBeenCalledWith(message, error);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('should call console.debug with the correct arguments', () => {
    const message = 'This is a debug message';
    const obj = { a: { b: 'c' } };
    debugLogger.debug(message, obj);
    expect(console.debug).toHaveBeenCalledWith(message, obj);
    expect(console.debug).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple arguments correctly for all methods', () => {
    debugLogger.log('one', 2, true);
    expect(console.log).toHaveBeenCalledWith('one', 2, true);

    debugLogger.warn('one', 2, false);
    expect(console.warn).toHaveBeenCalledWith('one', 2, false);

    debugLogger.error('one', 2, null);
    expect(console.error).toHaveBeenCalledWith('one', 2, null);

    debugLogger.debug('one', 2, undefined);
    expect(console.debug).toHaveBeenCalledWith('one', 2, undefined);
  });

  it('should handle calls with no arguments', () => {
    debugLogger.log();
    expect(console.log).toHaveBeenCalledWith();
    expect(console.log).toHaveBeenCalledTimes(1);

    debugLogger.warn();
    expect(console.warn).toHaveBeenCalledWith();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
