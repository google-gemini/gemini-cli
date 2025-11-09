/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'node:events';
import type { LoadServerHierarchicalMemoryResponse } from './memoryDiscovery.js';

export interface UserFeedbackPayload {
  message: string;
  severity: 'error' | 'warning' | 'info';
  error?: unknown;
}

export interface FallbackModeChangedPayload {
  isInFallbackMode: boolean;
}

export interface ModelChangedPayload {
  model: string;
}

/**
 * Payload for the 'memory-changed' event.
 */
export type MemoryChangedPayload = LoadServerHierarchicalMemoryResponse;

export interface McpSamplingRequestPayload {
  serverName: string;
  prompt: unknown;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

export enum CoreEvent {
  UserFeedback = 'user-feedback',
  FallbackModeChanged = 'fallback-mode-changed',
  ModelChanged = 'model-changed',
  MemoryChanged = 'memory-changed',
  McpSamplingRequest = 'mcp-sampling-request',
}

export interface CoreEvents {
  [CoreEvent.UserFeedback]: [UserFeedbackPayload];
  [CoreEvent.FallbackModeChanged]: [FallbackModeChangedPayload];
  [CoreEvent.ModelChanged]: [ModelChangedPayload];
  [CoreEvent.MemoryChanged]: [MemoryChangedPayload];
  [CoreEvent.McpSamplingRequest]: [McpSamplingRequestPayload];
}

export class CoreEventEmitter extends EventEmitter<CoreEvents> {
  private _feedbackBacklog: UserFeedbackPayload[] = [];
  private static readonly MAX_BACKLOG_SIZE = 10000;

  constructor() {
    super();
  }

  override on(
    event: CoreEvent.UserFeedback,
    listener: (payload: UserFeedbackPayload) => void,
  ): this;
  override on(
    event: CoreEvent.FallbackModeChanged,
    listener: (payload: FallbackModeChangedPayload) => void,
  ): this;
  override on(
    event: CoreEvent.ModelChanged,
    listener: (payload: ModelChangedPayload) => void,
  ): this;
  override on(
    event: CoreEvent.MemoryChanged,
    listener: (payload: MemoryChangedPayload) => void,
  ): this;
  override on(
    event: CoreEvent.McpSamplingRequest,
    listener: (payload: McpSamplingRequestPayload) => void,
  ): this;
  override on(
    event: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void,
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return super.on(event as any, listener as any);
  }

  override off(
    event: CoreEvent.UserFeedback,
    listener: (payload: UserFeedbackPayload) => void,
  ): this;
  override off(
    event: CoreEvent.FallbackModeChanged,
    listener: (payload: FallbackModeChangedPayload) => void,
  ): this;
  override off(
    event: CoreEvent.ModelChanged,
    listener: (payload: ModelChangedPayload) => void,
  ): this;
  override off(
    event: CoreEvent.MemoryChanged,
    listener: (payload: MemoryChangedPayload) => void,
  ): this;
  override off(
    event: CoreEvent.McpSamplingRequest,
    listener: (payload: McpSamplingRequestPayload) => void,
  ): this;
  override off(
    event: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void,
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return super.off(event as any, listener as any);
  }

  override emit(
    event: CoreEvent.UserFeedback,
    payload: UserFeedbackPayload,
  ): boolean;
  override emit(
    event: CoreEvent.FallbackModeChanged,
    payload: FallbackModeChangedPayload,
  ): boolean;
  override emit(
    event: CoreEvent.ModelChanged,
    payload: ModelChangedPayload,
  ): boolean;
  override emit(
    event: CoreEvent.MemoryChanged,
    payload: MemoryChangedPayload,
  ): boolean;
  override emit(
    event: CoreEvent.McpSamplingRequest,
    payload: McpSamplingRequestPayload,
  ): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override emit(event: string | symbol, ...args: any[]): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return super.emit(event as any, ...(args as any));
  }

  /**
   * Emits a user feedback event with the given severity and message.
   */
  emitFeedback(
    severity: 'error' | 'warning' | 'info',
    message: string,
    error?: unknown,
  ): void {
    const payload: UserFeedbackPayload = { severity, message, error };
    if (this.listenerCount(CoreEvent.UserFeedback) === 0) {
      // If no listeners are attached yet, store in backlog
      if (this._feedbackBacklog.length >= CoreEventEmitter.MAX_BACKLOG_SIZE) {
        this._feedbackBacklog.shift(); // Remove oldest item to maintain FIFO
      }
      this._feedbackBacklog.push(payload);
    } else {
      this.emit(CoreEvent.UserFeedback, payload);
    }
  }

  /**
   * Emits a fallback mode changed event.
   */
  emitFallbackModeChanged(isInFallbackMode: boolean): void {
    this.emit(CoreEvent.FallbackModeChanged, { isInFallbackMode });
  }

  /**
   * Emits a model changed event.
   */
  emitModelChanged(model: string): void {
    this.emit(CoreEvent.ModelChanged, { model });
  }

  /**
   * Drains the backlog of user feedback events that were emitted before a
   * listener was attached.
   *
   * This is useful for ensuring that feedback emitted during application
   * startup is not lost.
   */
  drainFeedbackBacklog() {
    for (const payload of this._feedbackBacklog) {
      this.emit(CoreEvent.UserFeedback, payload);
    }
    this._feedbackBacklog = [];
  }
}

export const coreEvents = new CoreEventEmitter();

export type { Client };
