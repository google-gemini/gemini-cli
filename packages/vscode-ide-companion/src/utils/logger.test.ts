/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { createLogger } from './logger.js';

vi.mock('vscode');

describe('createLogger', () => {
  let mockContext: vscode.ExtensionContext;
  let mockLogger: vscode.OutputChannel;

  beforeEach(() => {
    mockLogger = {
      appendLine: vi.fn(),
    } as unknown as vscode.OutputChannel;
  });

  describe('development mode', () => {
    beforeEach(() => {
      mockContext = {
        extensionMode: vscode.ExtensionMode.Development,
      } as vscode.ExtensionContext;
    });

    it('should log messages in development mode', () => {
      const logger = createLogger(mockContext, mockLogger);
      logger('test message');

      expect(mockLogger.appendLine).toHaveBeenCalledOnce();
      expect(mockLogger.appendLine).toHaveBeenCalledWith('test message');
    });

    it('should log multiple messages', () => {
      const logger = createLogger(mockContext, mockLogger);
      logger('message 1');
      logger('message 2');
      logger('message 3');

      expect(mockLogger.appendLine).toHaveBeenCalledTimes(3);
      expect(mockLogger.appendLine).toHaveBeenNthCalledWith(1, 'message 1');
      expect(mockLogger.appendLine).toHaveBeenNthCalledWith(2, 'message 2');
      expect(mockLogger.appendLine).toHaveBeenNthCalledWith(3, 'message 3');
    });

    it('should log empty messages', () => {
      const logger = createLogger(mockContext, mockLogger);
      logger('');

      expect(mockLogger.appendLine).toHaveBeenCalledOnce();
      expect(mockLogger.appendLine).toHaveBeenCalledWith('');
    });
  });

  describe('production mode', () => {
    beforeEach(() => {
      mockContext = {
        extensionMode: vscode.ExtensionMode.Production,
      } as vscode.ExtensionContext;
    });

    it('should not log messages in production mode', () => {
      const logger = createLogger(mockContext, mockLogger);
      logger('test message');

      expect(mockLogger.appendLine).not.toHaveBeenCalled();
    });

    it('should not log any of multiple messages in production mode', () => {
      const logger = createLogger(mockContext, mockLogger);
      logger('message 1');
      logger('message 2');
      logger('message 3');

      expect(mockLogger.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('test mode', () => {
    beforeEach(() => {
      mockContext = {
        extensionMode: vscode.ExtensionMode.Test,
      } as vscode.ExtensionContext;
    });

    it('should not log messages in test mode', () => {
      const logger = createLogger(mockContext, mockLogger);
      logger('test message');

      expect(mockLogger.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('logger reusability', () => {
    it('should create independent logger instances', () => {
      const context1 = {
        extensionMode: vscode.ExtensionMode.Development,
      } as vscode.ExtensionContext;
      const context2 = {
        extensionMode: vscode.ExtensionMode.Production,
      } as vscode.ExtensionContext;

      const logger1 = createLogger(context1, mockLogger);
      const logger2 = createLogger(context2, mockLogger);

      logger1('from logger 1');
      logger2('from logger 2');

      // Only logger1 should have logged (development mode)
      expect(mockLogger.appendLine).toHaveBeenCalledOnce();
      expect(mockLogger.appendLine).toHaveBeenCalledWith('from logger 1');
    });

    it('should use the same output channel for multiple loggers', () => {
      const context = {
        extensionMode: vscode.ExtensionMode.Development,
      } as vscode.ExtensionContext;

      const logger1 = createLogger(context, mockLogger);
      const logger2 = createLogger(context, mockLogger);

      logger1('message 1');
      logger2('message 2');

      expect(mockLogger.appendLine).toHaveBeenCalledTimes(2);
    });
  });
});
