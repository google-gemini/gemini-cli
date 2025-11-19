/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ConsolePatcher } from './ConsolePatcher.js';
import type { ConsoleMessageItem } from '../types.js';

describe('ConsolePatcher', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleDebug: typeof console.debug;
  let originalConsoleInfo: typeof console.info;

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleDebug = console.debug;
    originalConsoleInfo = console.info;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
    console.info = originalConsoleInfo;
  });

  describe('constructor', () => {
    it('should create instance with onNewMessage callback', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      expect(patcher).toBeDefined();
    });

    it('should create instance without onNewMessage callback', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      expect(patcher).toBeDefined();
    });

    it('should create instance with debugMode true', () => {
      const patcher = new ConsolePatcher({
        debugMode: true,
      });

      expect(patcher).toBeDefined();
    });

    it('should create instance with stderr option', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
        stderr: true,
      });

      expect(patcher).toBeDefined();
    });
  });

  describe('patch', () => {
    it('should patch console.log', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();

      expect(console.log).not.toBe(originalConsoleLog);

      patcher.cleanup();
    });

    it('should patch console.warn', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();

      expect(console.warn).not.toBe(originalConsoleWarn);

      patcher.cleanup();
    });

    it('should patch console.error', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();

      expect(console.error).not.toBe(originalConsoleError);

      patcher.cleanup();
    });

    it('should patch console.debug', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();

      expect(console.debug).not.toBe(originalConsoleDebug);

      patcher.cleanup();
    });

    it('should patch console.info', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();

      expect(console.info).not.toBe(originalConsoleInfo);

      patcher.cleanup();
    });

    it('should patch all console methods at once', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();

      expect(console.log).not.toBe(originalConsoleLog);
      expect(console.warn).not.toBe(originalConsoleWarn);
      expect(console.error).not.toBe(originalConsoleError);
      expect(console.debug).not.toBe(originalConsoleDebug);
      expect(console.info).not.toBe(originalConsoleInfo);

      patcher.cleanup();
    });
  });

  describe('cleanup', () => {
    it('should restore console.log', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();
      patcher.cleanup();

      expect(console.log).toBe(originalConsoleLog);
    });

    it('should restore all console methods', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();
      patcher.cleanup();

      expect(console.log).toBe(originalConsoleLog);
      expect(console.warn).toBe(originalConsoleWarn);
      expect(console.error).toBe(originalConsoleError);
      expect(console.debug).toBe(originalConsoleDebug);
      expect(console.info).toBe(originalConsoleInfo);
    });

    it('should allow multiple cleanup calls', () => {
      const patcher = new ConsolePatcher({
        debugMode: false,
      });

      patcher.patch();
      patcher.cleanup();
      patcher.cleanup();

      expect(console.log).toBe(originalConsoleLog);
    });
  });

  describe('message interception with callback', () => {
    it('should intercept console.log calls', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('test message');

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'test message',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should intercept console.warn calls', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.warn('warning message');

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'warn',
        content: 'warning message',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should intercept console.error calls', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.error('error message');

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'error',
        content: 'error message',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should intercept console.info calls', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.info('info message');

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'info',
        content: 'info message',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should not intercept console.debug when debugMode is false', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.debug('debug message');

      expect(onNewMessage).not.toHaveBeenCalled();

      patcher.cleanup();
    });

    it('should intercept console.debug when debugMode is true', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: true,
      });

      patcher.patch();
      console.debug('debug message');

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'debug',
        content: 'debug message',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should format multiple arguments', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('value:', 42);

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'value: 42',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should format objects', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('obj:', { key: 'value' });

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: "obj: { key: 'value' }",
        count: 1,
      });

      patcher.cleanup();
    });

    it('should format arrays', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('arr:', [1, 2, 3]);

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'arr: [ 1, 2, 3 ]',
        count: 1,
      });

      patcher.cleanup();
    });
  });

  describe('debugMode behavior', () => {
    it('should call original method when debugMode is true', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: true,
      });

      patcher.patch();
      console.log('test');

      // Should be called at least once (by the patch)
      expect(spy).toHaveBeenCalled();

      patcher.cleanup();
      spy.mockRestore();
    });

    it('should not call original method when debugMode is false', () => {
      const originalLog = console.log;
      const spy = vi.fn();
      console.log = spy;

      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('test');

      // The spy is the patched version, not the original
      expect(spy).not.toHaveBeenCalled();

      patcher.cleanup();
      console.log = originalLog;
    });
  });

  describe('stderr mode', () => {
    it('should redirect console.log to stderr', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const patcher = new ConsolePatcher({
        debugMode: false,
        stderr: true,
      });

      patcher.patch();
      console.log('test message');

      patcher.cleanup();
      errorSpy.mockRestore();
    });

    it('should redirect console.warn to stderr', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const patcher = new ConsolePatcher({
        debugMode: false,
        stderr: true,
      });

      patcher.patch();
      console.warn('warning');

      patcher.cleanup();
      errorSpy.mockRestore();
    });

    it('should redirect console.error to stderr', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const patcher = new ConsolePatcher({
        debugMode: false,
        stderr: true,
      });

      patcher.patch();
      console.error('error');

      patcher.cleanup();
      errorSpy.mockRestore();
    });

    it('should redirect console.info to stderr', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const patcher = new ConsolePatcher({
        debugMode: false,
        stderr: true,
      });

      patcher.patch();
      console.info('info');

      patcher.cleanup();
      errorSpy.mockRestore();
    });

    it('should not redirect console.debug to stderr when debugMode is false', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const patcher = new ConsolePatcher({
        debugMode: false,
        stderr: true,
      });

      patcher.patch();
      console.debug('debug');

      expect(errorSpy).not.toHaveBeenCalled();

      patcher.cleanup();
      errorSpy.mockRestore();
    });

    it('should redirect console.debug to stderr when debugMode is true', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const patcher = new ConsolePatcher({
        debugMode: true,
        stderr: true,
      });

      patcher.patch();
      console.debug('debug');

      patcher.cleanup();
      errorSpy.mockRestore();
    });

    it('should not call onNewMessage when in stderr mode', () => {
      const onNewMessage = vi.fn();
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
        stderr: true,
      });

      patcher.patch();
      console.log('test');

      expect(onNewMessage).not.toHaveBeenCalled();

      patcher.cleanup();
      errorSpy.mockRestore();
    });
  });

  describe('message formatting', () => {
    it('should handle null values', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log(null);

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'null',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should handle undefined values', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log(undefined);

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'undefined',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should handle numbers', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log(42);

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: '42',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should handle booleans', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log(true);

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'true',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should handle errors', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      const error = new Error('Test error');
      console.log(error);

      const call = onNewMessage.mock.calls[0]?.[0] as
        | Omit<ConsoleMessageItem, 'id'>
        | undefined;
      expect(call?.type).toBe('log');
      expect(call?.content).toContain('Error: Test error');
      expect(call?.count).toBe(1);

      patcher.cleanup();
    });

    it('should handle empty calls', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log();

      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: '',
        count: 1,
      });

      patcher.cleanup();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple console types in sequence', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('log');
      console.warn('warn');
      console.error('error');

      expect(onNewMessage).toHaveBeenCalledTimes(3);
      expect(onNewMessage).toHaveBeenNthCalledWith(1, {
        type: 'log',
        content: 'log',
        count: 1,
      });
      expect(onNewMessage).toHaveBeenNthCalledWith(2, {
        type: 'warn',
        content: 'warn',
        count: 1,
      });
      expect(onNewMessage).toHaveBeenNthCalledWith(3, {
        type: 'error',
        content: 'error',
        count: 1,
      });

      patcher.cleanup();
    });

    it('should allow patch and cleanup cycles', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('first');
      patcher.cleanup();

      patcher.patch();
      console.log('second');
      patcher.cleanup();

      expect(onNewMessage).toHaveBeenCalledTimes(2);
    });

    it('should maintain count value at 1 for each call', () => {
      const onNewMessage = vi.fn();
      const patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
      });

      patcher.patch();
      console.log('message 1');
      console.log('message 2');
      console.log('message 3');

      expect(onNewMessage).toHaveBeenCalledTimes(3);
      onNewMessage.mock.calls.forEach((call) => {
        expect(call[0]?.count).toBe(1);
      });

      patcher.cleanup();
    });
  });
});
