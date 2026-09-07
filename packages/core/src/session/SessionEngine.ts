/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { EventBus } from '../events/EventBus.js';
import type { ModelProvider, ChatMessage } from '../providers/ModelProvider.js';
import { PlaceholderProvider } from '../providers/placeholder/PlaceholderProvider.js';

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export type SessionState = 'idle' | 'processing' | 'error';

export interface SessionEngineOptions {
  provider?: ModelProvider;
  model?: string;
  eventBus?: EventBus;
}

export class SessionEngine {
  public readonly id: string;
  public readonly events: EventBus;
  private provider: ModelProvider;
  private model: string;
  private messages: SessionMessage[] = [];
  private state: SessionState = 'idle';

  constructor(options: SessionEngineOptions = {}) {
    this.id = randomUUID();
    this.events = options.eventBus ?? new EventBus();
    this.provider = options.provider ?? new PlaceholderProvider();
    this.model = options.model ?? 'placeholder';
  }

  public getProvider(): ModelProvider {
    return this.provider;
  }

  public getModel(): string {
    return this.model;
  }

  public setProvider(provider: ModelProvider, model?: string): void {
    this.provider = provider;
    if (model) {
      this.model = model;
    }
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
      const chatMessages: ChatMessage[] = this.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let accumulated = '';
      for await (const event of this.provider.chat({
        messages: chatMessages,
        model: this.model,
      })) {
        if (event.type === 'chunk') {
          accumulated += event.text;
          this.events.emit('runtime:stream', {
            chunk: event.text,
            fullText: accumulated,
          });
        } else if (event.type === 'complete') {
          accumulated = event.fullText || accumulated;
        } else if (event.type === 'error') {
          throw event.error;
        }
      }

      const assistantMsg: SessionMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: accumulated,
        timestamp: Date.now(),
      };
      this.messages.push(assistantMsg);
      this.events.emit('runtime:message', {
        content: accumulated,
        role: 'assistant',
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
