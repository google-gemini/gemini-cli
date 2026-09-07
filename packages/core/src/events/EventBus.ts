/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

export interface ZoeEvents {
  'session:start': { sessionId: string };
  'session:end': { sessionId: string; reason?: string };
  'user:input': { text: string };
  'runtime:message': { content: string; role: 'assistant' | 'system' };
  'runtime:state': { state: 'idle' | 'processing' | 'error' };
  'command:result': { command: string; success: boolean; message?: string };
  'history:cleared': Record<string, never>;
}

export class EventBus {
  private emitter = new EventEmitter();

  on<K extends keyof ZoeEvents>(event: K, listener: (data: ZoeEvents[K]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  off<K extends keyof ZoeEvents>(event: K, listener: (data: ZoeEvents[K]) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  emit<K extends keyof ZoeEvents>(event: K, data: ZoeEvents[K]): boolean {
    return this.emitter.emit(event, data);
  }

  removeAllListeners(): this {
    this.emitter.removeAllListeners();
    return this;
  }
}
