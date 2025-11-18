/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AppEvent, appEvents } from './events.js';

describe('events', () => {
  describe('AppEvent enum', () => {
    it('should have OpenDebugConsole event', () => {
      expect(AppEvent.OpenDebugConsole).toBe('open-debug-console');
    });

    it('should have LogError event', () => {
      expect(AppEvent.LogError).toBe('log-error');
    });

    it('should have OauthDisplayMessage event', () => {
      expect(AppEvent.OauthDisplayMessage).toBe('oauth-display-message');
    });

    it('should have exactly 3 event types', () => {
      const eventKeys = Object.keys(AppEvent);
      expect(eventKeys).toHaveLength(3);
    });

    it('should use kebab-case for event names', () => {
      const eventValues = Object.values(AppEvent);
      eventValues.forEach((value) => {
        expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });
  });

  describe('appEvents', () => {
    it('should be an instance of EventEmitter', () => {
      expect(appEvents).toBeInstanceOf(EventEmitter);
    });

    it('should be able to emit and listen to events', () => {
      const listener = vi.fn();
      appEvents.on(AppEvent.LogError, listener);

      appEvents.emit(AppEvent.LogError, 'test error');

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith('test error');

      appEvents.off(AppEvent.LogError, listener);
    });

    it('should support multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      appEvents.on(AppEvent.OpenDebugConsole, listener1);
      appEvents.on(AppEvent.OpenDebugConsole, listener2);

      appEvents.emit(AppEvent.OpenDebugConsole);

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();

      appEvents.off(AppEvent.OpenDebugConsole, listener1);
      appEvents.off(AppEvent.OpenDebugConsole, listener2);
    });

    it('should support removing listeners', () => {
      const listener = vi.fn();

      appEvents.on(AppEvent.OauthDisplayMessage, listener);
      appEvents.off(AppEvent.OauthDisplayMessage, listener);

      appEvents.emit(AppEvent.OauthDisplayMessage, 'test message');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support once listeners', () => {
      const listener = vi.fn();

      appEvents.once(AppEvent.LogError, listener);

      appEvents.emit(AppEvent.LogError, 'error 1');
      appEvents.emit(AppEvent.LogError, 'error 2');

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith('error 1');
    });

    it('should isolate different event types', () => {
      const logErrorListener = vi.fn();
      const debugConsoleListener = vi.fn();

      appEvents.on(AppEvent.LogError, logErrorListener);
      appEvents.on(AppEvent.OpenDebugConsole, debugConsoleListener);

      appEvents.emit(AppEvent.LogError, 'error');

      expect(logErrorListener).toHaveBeenCalledOnce();
      expect(debugConsoleListener).not.toHaveBeenCalled();

      appEvents.off(AppEvent.LogError, logErrorListener);
      appEvents.off(AppEvent.OpenDebugConsole, debugConsoleListener);
    });
  });
});
