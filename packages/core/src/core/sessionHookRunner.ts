/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type {
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
} from '../hooks/types.js';
import {
  fireSessionStartHook,
  fireSessionEndHook,
  firePreCompressHook,
} from './sessionHookTriggers.js';

export interface SessionHookRunner {
  fireSessionStart(source: SessionStartSource): Promise<void>;
  fireSessionEnd(reason: SessionEndReason): Promise<void>;
  firePreCompress(trigger: PreCompressTrigger): Promise<void>;
}

class ActiveSessionHookRunner implements SessionHookRunner {
  constructor(private messageBus: MessageBus) {}
  async fireSessionStart(source: SessionStartSource): Promise<void> {
    await fireSessionStartHook(this.messageBus, source);
  }
  async fireSessionEnd(reason: SessionEndReason): Promise<void> {
    await fireSessionEndHook(this.messageBus, reason);
  }
  async firePreCompress(trigger: PreCompressTrigger): Promise<void> {
    await firePreCompressHook(this.messageBus, trigger);
  }
}

export class NoOpSessionHookRunner implements SessionHookRunner {
  async fireSessionStart(_source: SessionStartSource): Promise<void> {
    // No-op
  }
  async fireSessionEnd(_reason: SessionEndReason): Promise<void> {
    // No-op
  }
  async firePreCompress(_trigger: PreCompressTrigger): Promise<void> {
    // No-op
  }
}

export function createSessionHookRunner(
  messageBus: MessageBus,
): SessionHookRunner {
  return new ActiveSessionHookRunner(messageBus);
}
