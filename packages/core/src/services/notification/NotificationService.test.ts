/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import notifier from 'node-notifier';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { NotificationService } from './NotificationService.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type NotificationRequest,
  type ToolConfirmationRequest,
} from '../../confirmation-bus/types.js';
import { CoreEventEmitter } from '../../utils/events.js';
import { isTerminalAppFocused } from './focusUtils.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('./focusUtils.js', () => ({
  isTerminalAppFocused: vi.fn(),
}));

vi.mock('node-notifier', () => {
  const mockNotifyFn = vi.fn();
  class MockNotifier {
    notify = mockNotifyFn;
  }
  return {
    default: {
      notify: mockNotifyFn,
      NotificationCenter: MockNotifier,
      WindowsToaster: MockNotifier,
      NotifySend: MockNotifier,
    },
  };
});

describe('NotificationService', () => {
  const mockNotify = notifier.notify as unknown as ReturnType<typeof vi.fn>;
  const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
  const mockIsTerminalAppFocused =
    isTerminalAppFocused as unknown as ReturnType<typeof vi.fn>;
  const originalPlatform = process.platform;
  const originalEnvBundleId = process.env['__CFBundleIdentifier'];
  const originalEnvTermProgram = process.env['TERM_PROGRAM'];
  let mockEvents: CoreEventEmitter;

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    delete process.env['__CFBundleIdentifier'];
    delete process.env['TERM_PROGRAM'];
    mockEvents = new CoreEventEmitter();
    mockExecSync.mockReturnValue(''); // Default to empty string (no match)
    mockIsTerminalAppFocused.mockReturnValue(null);
  });

  afterEach(() => {
    process.env['__CFBundleIdentifier'] = originalEnvBundleId;
    process.env['TERM_PROGRAM'] = originalEnvTermProgram;
    vi.restoreAllMocks();
  });

  it('should notify when enabled', () => {
    const service = new NotificationService({ enabled: true }, mockEvents);
    // Unfocus to allow notification
    mockEvents.emitWindowFocusChanged(false);
    service.notify({ message: 'Test Message' });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test Message',
        title: 'Gemini CLI',
      }),
      expect.any(Function),
    );
  });

  it('should NOT notify when disabled', () => {
    const service = new NotificationService({ enabled: false }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);
    service.notify({ message: 'Test Message' });

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('should include activate option on macOS if provided', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);
    service.notify({ message: 'Test', activate: 'com.test.app' });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: 'com.test.app',
      }),
      expect.any(Function),
    );
  });

  it('should include activate option on macOS from env if not provided', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['__CFBundleIdentifier'] = 'com.env.app';
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);
    service.notify({ message: 'Test' });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: 'com.env.app',
      }),
      expect.any(Function),
    );
  });

  it('should handle MessageBus subscriptions and notify on TOOL_CONFIRMATION_REQUEST', () => {
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);
    const mockBus = {
      subscribe: vi.fn(),
    } as unknown as MessageBus;

    service.subscribeToBus(mockBus);

    expect(mockBus.subscribe).toHaveBeenCalledWith(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      expect.any(Function),
    );

    // Simulate event
    const handler = vi.mocked(mockBus.subscribe).mock.calls[0][1] as (
      msg: ToolConfirmationRequest,
    ) => void;
    handler({
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      correlationId: 'test-correlation-id',
      toolCall: { name: 'test_tool' } as never,
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Require tool Permission: test_tool',
      }),
      expect.any(Function),
    );
  });

  it('should handle NOTIFICATION_REQUEST with force flag', () => {
    const service = new NotificationService({ enabled: false }, mockEvents);
    const mockBus = {
      subscribe: vi.fn(),
    } as unknown as MessageBus;

    service.subscribeToBus(mockBus);

    // Simulate event
    const calls = vi.mocked(mockBus.subscribe).mock.calls;
    const notificationCall = calls.find(
      (call) => call[0] === MessageBusType.NOTIFICATION_REQUEST,
    );
    const handler = notificationCall![1] as (msg: NotificationRequest) => void;

    handler({
      type: MessageBusType.NOTIFICATION_REQUEST,
      message: 'Policy Alert',
      force: true,
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Policy Alert',
        force: true,
      }),
      expect.any(Function),
    );
  });

  it('should NOT notify if focused', () => {
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('should notify if NOT focused', () => {
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);

    service.notify({ message: 'Test' });
    expect(mockNotify).toHaveBeenCalled();
  });

  it('should NOT notify in WarpTerminal if OS check confirms focus', () => {
    process.env['TERM_PROGRAM'] = 'WarpTerminal';
    mockIsTerminalAppFocused.mockReturnValue(true);

    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockIsTerminalAppFocused).toHaveBeenCalled();
  });

  it('should notify in WarpTerminal if OS check confirms NOT focused', () => {
    process.env['TERM_PROGRAM'] = 'WarpTerminal';
    mockIsTerminalAppFocused.mockReturnValue(false);

    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).toHaveBeenCalled();
  });

  it('should NOT notify on Windows if OS check confirms focus', () => {
    process.env['TERM_PROGRAM'] = 'Apple_Terminal';
    mockIsTerminalAppFocused.mockReturnValue(true);

    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockIsTerminalAppFocused).toHaveBeenCalled();
  });

  it('should NOT notify on Linux if OS check confirms focus', () => {
    process.env['TERM_PROGRAM'] = 'Apple_Terminal';
    mockIsTerminalAppFocused.mockReturnValue(true);

    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockIsTerminalAppFocused).toHaveBeenCalled();
  });

  it('should notify even if disabled when force is true', () => {
    const service = new NotificationService({ enabled: false }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test', force: true });
    expect(mockNotify).toHaveBeenCalled();
  });

  it('should notify in unsupported terminal (Apple_Terminal) even if focused, when OS check fails', () => {
    process.env['TERM_PROGRAM'] = 'Apple_Terminal';
    // Ensure OS check fails (returns null)
    mockIsTerminalAppFocused.mockReturnValue(null);

    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).toHaveBeenCalled();
  });

  it('should NOT notify in unsupported terminal (Apple_Terminal) if OS check confirms focus', () => {
    process.env['TERM_PROGRAM'] = 'Apple_Terminal';
    mockIsTerminalAppFocused.mockReturnValue(true);

    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('should notify if OS check confirms NOT focused', () => {
    process.env['TERM_PROGRAM'] = 'Apple_Terminal';
    mockIsTerminalAppFocused.mockReturnValue(false);

    const service = new NotificationService({ enabled: true }, mockEvents);
    // Even if internal focus thinks it's true (default), the OS check says no.
    mockEvents.emitWindowFocusChanged(true);

    service.notify({ message: 'Test' });
    expect(mockNotify).toHaveBeenCalled();
  });

  it('should send OSC 9 escape sequence for iTerm', () => {
    process.env['TERM_PROGRAM'] = 'iTerm.app';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);

    service.notify({ message: 'Test iTerm' });

    expect(stdoutSpy).toHaveBeenCalledWith('\x1b]9;Test iTerm\x07');
  });

  it('should send OSC 9 escape sequence for Kitty', () => {
    process.env['TERM_PROGRAM'] = 'kitty';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);

    service.notify({ message: 'Test Kitty' });

    expect(stdoutSpy).toHaveBeenCalledWith('\x1b]9;Test Kitty\x07');
  });

  it('should sanitize message in escape sequence', () => {
    process.env['TERM_PROGRAM'] = 'iTerm.app';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const service = new NotificationService({ enabled: true }, mockEvents);
    mockEvents.emitWindowFocusChanged(false);

    service.notify({ message: 'Test\nMessage\x07' });

    // Newline and BEL should be removed
    expect(stdoutSpy).toHaveBeenCalledWith('\x1b]9;TestMessage\x07');
  });
});
