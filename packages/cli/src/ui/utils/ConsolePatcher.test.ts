/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConsolePatcher } from './ConsolePatcher.js';

describe('ConsolePatcher', () => {
  let patcher: ConsolePatcher;
  const onNewMessage = vi.fn();

  afterEach(() => {
    if (patcher) {
      patcher.cleanup();
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should patch and restore console methods', () => {
    const beforeLog = console.log;
    const beforeWarn = console.warn;
    const beforeError = console.error;
    const beforeDebug = console.debug;
    const beforeInfo = console.info;

    patcher = new ConsolePatcher({ onNewMessage, debugMode: false });
    patcher.patch();

    expect(console.log).not.toBe(beforeLog);
    expect(console.warn).not.toBe(beforeWarn);
    expect(console.error).not.toBe(beforeError);
    expect(console.debug).not.toBe(beforeDebug);
    expect(console.info).not.toBe(beforeInfo);

    patcher.cleanup();

    expect(console.log).toBe(beforeLog);
    expect(console.warn).toBe(beforeWarn);
    expect(console.error).toBe(beforeError);
    expect(console.debug).toBe(beforeDebug);
    expect(console.info).toBe(beforeInfo);
  });

  describe('Interactive mode', () => {
    it('should ignore log and info when it is not interactive and debugMode is false', () => {
      patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
        interactive: false,
      });
      patcher.patch();

      console.log('test log');
      console.info('test info');
      expect(onNewMessage).not.toHaveBeenCalled();
    });

    it('should not ignore log and info when it is not interactive and debugMode is true', () => {
      patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: true,
        interactive: false,
      });
      patcher.patch();

      console.log('test log');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'test log',
        count: 1,
      });

      console.info('test info');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'info',
        content: 'test info',
        count: 1,
      });
    });

    it('should not ignore log and info when it is interactive', () => {
      patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
        interactive: true,
      });
      patcher.patch();

      console.log('test log');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'test log',
        count: 1,
      });

      console.info('test info');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'info',
        content: 'test info',
        count: 1,
      });
    });
  });

  describe('when stderr is false', () => {
    it('should call onNewMessage for log, warn, error, and info', () => {
      patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
        stderr: false,
      });
      patcher.patch();

      console.log('test log');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'test log',
        count: 1,
      });

      console.warn('test warn');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'warn',
        content: 'test warn',
        count: 1,
      });

      console.error('test error');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'error',
        content: 'test error',
        count: 1,
      });

      console.info('test info');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'info',
        content: 'test info',
        count: 1,
      });
    });

    it('should not call onNewMessage for debug when debugMode is false', () => {
      patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
        stderr: false,
      });
      patcher.patch();

      console.debug('test debug');
      expect(onNewMessage).not.toHaveBeenCalled();
    });

    it('should call onNewMessage for debug when debugMode is true', () => {
      patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: true,
        stderr: false,
      });
      patcher.patch();

      console.debug('test debug');
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'debug',
        content: 'test debug',
        count: 1,
      });
    });

    it('should format multiple arguments using util.format', () => {
      patcher = new ConsolePatcher({
        onNewMessage,
        debugMode: false,
        stderr: false,
      });
      patcher.patch();

      console.log('test %s %d', 'string', 123);
      expect(onNewMessage).toHaveBeenCalledWith({
        type: 'log',
        content: 'test string 123',
        count: 1,
      });
    });
  });

  describe('when stderr is true', () => {
    it('should redirect warn and error to originalConsoleError', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      patcher = new ConsolePatcher({ debugMode: false, stderr: true });
      patcher.patch();

      console.warn('test warn');
      expect(spyError).toHaveBeenCalledWith('test warn');

      console.error('test error');
      expect(spyError).toHaveBeenCalledWith('test error');
    });

    it('should redirect log and info to originalConsoleError when debugMode is true', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      patcher = new ConsolePatcher({ debugMode: true, stderr: true });
      patcher.patch();

      console.log('test log');
      expect(spyError).toHaveBeenCalledWith('test log');

      console.info('test info');
      expect(spyError).toHaveBeenCalledWith('test info');
    });

    it('should ignore debug when debugMode is false', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      patcher = new ConsolePatcher({ debugMode: false, stderr: true });
      patcher.patch();

      console.debug('test debug');
      expect(spyError).not.toHaveBeenCalled();
    });

    it('should redirect debug to originalConsoleError when debugMode is true', () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      patcher = new ConsolePatcher({ debugMode: true, stderr: true });
      patcher.patch();

      console.debug('test debug');
      expect(spyError).toHaveBeenCalledWith('test debug');
    });
  });
});
