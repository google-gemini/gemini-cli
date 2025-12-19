/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debugLogger } from './debugLogger.js';

describe('DebugLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('when debug mode is disabled', () => {
    it('should not call console.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debugLogger.log('This should not appear');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not call console.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      debugLogger.warn('This should not appear');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not call console.debug', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      debugLogger.debug('This should not appear');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should always call console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const message = 'This is an error message';
      const error = new Error('Something went wrong');
      debugLogger.error(message, error);
      expect(spy).toHaveBeenCalledWith(message, error);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('when debug mode is enabled via DEBUG=1', () => {
    beforeEach(() => {
      vi.stubEnv('DEBUG', '1');
    });

    it('should call console.log with the correct arguments', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
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

    it('should call console.debug with the correct arguments', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const message = 'This is a debug message';
      const obj = { a: { b: 'c' } };
      debugLogger.debug(message, obj);
      expect(spy).toHaveBeenCalledWith(message, obj);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple arguments correctly for all methods', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      debugLogger.log('one', 2, true);
      expect(logSpy).toHaveBeenCalledWith('one', 2, true);

      debugLogger.warn('one', 2, false);
      expect(warnSpy).toHaveBeenCalledWith('one', 2, false);

      debugLogger.error('one', 2, null);
      expect(errorSpy).toHaveBeenCalledWith('one', 2, null);

      debugLogger.debug('one', 2, undefined);
      expect(debugSpy).toHaveBeenCalledWith('one', 2, undefined);
    });
  });

  describe('when debug mode is enabled via DEBUG=true', () => {
    beforeEach(() => {
      vi.stubEnv('DEBUG', 'true');
    });

    it('should call console.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debugLogger.log('test');
      expect(spy).toHaveBeenCalledWith('test');
    });
  });

  describe('when debug mode is enabled via DEBUG_MODE=1', () => {
    beforeEach(() => {
      vi.stubEnv('DEBUG_MODE', '1');
    });

    it('should call console.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      debugLogger.log('test');
      expect(spy).toHaveBeenCalledWith('test');
    });
  });
});
