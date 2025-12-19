/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

/**
 * Defines the severity level for user-facing feedback.
 * This maps loosely to UI `MessageType`
 */
export type FeedbackSeverity = 'info' | 'warning' | 'error';

/**
 * Payload for the 'user-feedback' event.
 */
export interface UserFeedbackPayload {
  /**
   * The severity level determines how the message is rendered in the UI
   * (e.g. colored text, specific icon).
   */
  severity: FeedbackSeverity;
  /**
   * The main message to display to the user in the chat history or stdout.
   */
  message: string;
  /**
   * The original error object, if applicable.
   * Listeners can use this to extract stack traces for debug logging
   * or verbose output, while keeping the 'message' field clean for end users.
   */
  error?: unknown;
}

/**
 * Payload for the 'model-changed' event.
 */
export interface ModelChangedPayload {
  /**
   * The new model that was set.
   */
  model: string;
}

/**
 * Payload for the 'console-log' event.
 */
export interface ConsoleLogPayload {
  type: 'log' | 'warn' | 'error' | 'debug' | 'info';
  content: string;
}

/**
 * Payload for the 'output' event.
 */
export interface OutputPayload {
  isStderr: boolean;
  chunk: Uint8Array | string;
  encoding?: BufferEncoding;
}

/**
 * Payload for the 'memory-changed' event.
 */
export interface MemoryChangedPayload {
  fileCount: number;
}

export enum CoreEvent {
  UserFeedback = 'user-feedback',
  ModelChanged = 'model-changed',
  ConsoleLog = 'console-log',
  Output = 'output',
  MemoryChanged = 'memory-changed',
  ExternalEditorClosed = 'external-editor-closed',
}

export interface CoreEvents {
  [CoreEvent.UserFeedback]: [UserFeedbackPayload];
  [CoreEvent.ModelChanged]: [ModelChangedPayload];
  [CoreEvent.ConsoleLog]: [ConsoleLogPayload];
  [CoreEvent.Output]: [OutputPayload];
  [CoreEvent.MemoryChanged]: [MemoryChangedPayload];
  [CoreEvent.ExternalEditorClosed]: never[];
}

type EventBacklogItem = {
  [K in keyof CoreEvents]: {
    event: K;
    args: CoreEvents[K];
  };
}[keyof CoreEvents];

export class CoreEventEmitter extends EventEmitter<CoreEvents> {
  private _eventBacklog: EventBacklogItem[] = [];
  private static readonly MAX_BACKLOG_SIZE = 10000;

  constructor() {
    super();
  }

  private _emitOrQueue<K extends keyof CoreEvents>(
    event: K,
    ...args: CoreEvents[K]
  ): void {
    if (this.listenerCount(event) === 0) {
      if (this._eventBacklog.length >= CoreEventEmitter.MAX_BACKLOG_SIZE) {
        this._eventBacklog.shift();
      }
      this._eventBacklog.push({ event, args } as EventBacklogItem);
    } else {
      (
        this.emit as <K extends keyof CoreEvents>(
          event: K,
          ...args: CoreEvents[K]
        ) => boolean
      )(event, ...args);
    }
  }

  /**
   * Sends actionable feedback to the user.
   * Buffers automatically if the UI hasn't subscribed yet.
   */
  emitFeedback(
    severity: FeedbackSeverity,
    message: string,
    error?: unknown,
  ): void {
    const payload: UserFeedbackPayload = { severity, message, error };
    this._emitOrQueue(CoreEvent.UserFeedback, payload);
  }

  /**
   * Broadcasts a console log message.
   */
  emitConsoleLog(
    type: 'log' | 'warn' | 'error' | 'debug' | 'info',
    content: string,
  ): void {
    const payload: ConsoleLogPayload = { type, content };
    this._emitOrQueue(CoreEvent.ConsoleLog, payload);
  }

  /**
   * Broadcasts stdout/stderr output.
   */
  emitOutput(
    isStderr: boolean,
    chunk: Uint8Array | string,
    encoding?: BufferEncoding,
  ): void {
    const payload: OutputPayload = { isStderr, chunk, encoding };
    this._emitOrQueue(CoreEvent.Output, payload);
  }

  /**
   * Notifies subscribers that the model has changed.
   */
  emitModelChanged(model: string): void {
    const payload: ModelChangedPayload = { model };
    this.emit(CoreEvent.ModelChanged, payload);
  }

  /**
   * Flushes buffered messages. Call this immediately after primary UI listener
   * subscribes.
   */
  drainBacklogs(): void {
    const backlog = [...this._eventBacklog];
    this._eventBacklog.length = 0; // Clear in-place
    for (const item of backlog) {
      (
        this.emit as <K extends keyof CoreEvents>(
          event: K,
          ...args: CoreEvents[K]
        ) => boolean
      )(item.event, ...item.args);
    }
  }
}

export const coreEvents = new CoreEventEmitter();
