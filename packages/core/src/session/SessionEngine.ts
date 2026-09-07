/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { EventBus } from '../events/EventBus.js';
import { PlaceholderRuntime, type ZoeRuntime } from '../runtime/PlaceholderRuntime.js';

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export type SessionState = 'idle' | 'processing' | 'error';

export class SessionEngine {
  public readonly id: string;
  public readonly events: EventBus;
  private runtime: ZoeRuntime;
  private messages: SessionMessage[] = [];
  private state: SessionState = 'idle';

  constructor(runtime?: ZoeRuntime, eventBus?: EventBus) {
    this.id = randomUUID();
    this.events = eventBus ?? new EventBus();
    this.runtime = runtime ?? new PlaceholderRuntime();
  }

  public start(): void {
    this.events.emit('session:start', { sessionId: this.id });
  }

  public getMessages(): SessionMessage[] {
    return [...this.messages];
  }

  public getState(): SessionState {
    return this.state;
  }

  public clearHistory(): void {
    this.messages = [];
    this.events.emit('history:cleared', {});
  }

  public addSystemMessage(content: string): void {
    const msg: SessionMessage = {
      id: randomUUID(),
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    this.messages.push(msg);
    this.events.emit('runtime:message', {
      content: msg.content,
      role: 'system',
    });
  }

  public async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Record user message
    const userMsg: SessionMessage = {
      id: randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);
    this.events.emit('user:input', { text: trimmed });

    // Transition state
    this.state = 'processing';
    this.events.emit('runtime:state', { state: 'processing' });

    try {
      const response = await this.runtime.process(trimmed);
      const assistantMsg: SessionMessage = {
        id: randomUUID(),
        role: response.role,
        content: response.content,
        timestamp: Date.now(),
      };
      this.messages.push(assistantMsg);
      this.events.emit('runtime:message', {
        content: response.content,
        role: response.role,
      });

      this.state = 'idle';
      this.events.emit('runtime:state', { state: 'idle' });
    } catch (error) {
      this.state = 'error';
      this.events.emit('runtime:state', { state: 'error' });
      const errorMsg: SessionMessage = {
        id: randomUUID(),
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
      this.messages.push(errorMsg);
      this.events.emit('runtime:message', {
        content: errorMsg.content,
        role: 'system',
      });
      this.state = 'idle';
      this.events.emit('runtime:state', { state: 'idle' });
    }
  }

  public end(reason?: string): void {
    this.events.emit('session:end', { sessionId: this.id, reason });
  }
}
