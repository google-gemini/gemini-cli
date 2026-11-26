/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { debugLogger } from './debugLogger.js';

describe('DebugLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call console.error for log() to ensure output goes to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = 'This is a log message';
    const data = { key: 'value' };
    debugLogger.log(message, data);
    expect(spy).toHaveBeenCalledWith(message, data);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call console.warn with the correct arguments', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const message = 'This is a warning message';
    const data = [1, 2, 3];
    debugLogger.warn(message, data);
    expect(spy).toHaveBeenCalledWith(message, data);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call console.error with the correct arguments', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = 'This is an error message';
    const error = new Error('Something went wrong');
    debugLogger.error(message, error);
    expect(spy).toHaveBeenCalledWith(message, error);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call console.error for debug() to ensure output goes to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = 'This is a debug message';
    const obj = { a: { b: 'c' } };
    debugLogger.debug(message, obj);
    expect(spy).toHaveBeenCalledWith(message, obj);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple arguments correctly for all methods', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debugLogger.log('one', 2, true);
    expect(errorSpy).toHaveBeenCalledWith('one', 2, true);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    debugLogger.warn('one', 2, false);
    expect(warnSpy).toHaveBeenCalledWith('one', 2, false);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockClear();
    debugLogger.error('one', 2, null);
    expect(errorSpy).toHaveBeenCalledWith('one', 2, null);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockClear();
    debugLogger.debug('one', 2, undefined);
    expect(errorSpy).toHaveBeenCalledWith('one', 2, undefined);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle calls with no arguments', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debugLogger.log();
    expect(errorSpy).toHaveBeenCalledWith();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    debugLogger.warn();
    expect(warnSpy).toHaveBeenCalledWith();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
