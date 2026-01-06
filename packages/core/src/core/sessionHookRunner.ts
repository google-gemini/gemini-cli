/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type {
  DefaultHookOutput,
  PreCompressTrigger,
  SessionEndReason,
  SessionStartSource,
} from '../hooks/types.js';
import {
  firePreCompressHook,
  fireSessionEndHook,
  fireSessionStartHook,
} from './sessionHookTriggers.js';

export interface SessionHookRunner {
  fireSessionStart(
    source: SessionStartSource,
  ): Promise<DefaultHookOutput | undefined>;
  fireSessionEnd(reason: SessionEndReason): Promise<void>;
  firePreCompress(trigger: PreCompressTrigger): Promise<void>;
}

class ActiveSessionHookRunner implements SessionHookRunner {
  constructor(private messageBus: MessageBus) {}
  async fireSessionStart(
    source: SessionStartSource,
  ): Promise<DefaultHookOutput | undefined> {
    return fireSessionStartHook(this.messageBus, source);
  }
  async fireSessionEnd(reason: SessionEndReason): Promise<void> {
    await fireSessionEndHook(this.messageBus, reason);
  }
  async firePreCompress(trigger: PreCompressTrigger): Promise<void> {
    await firePreCompressHook(this.messageBus, trigger);
  }
}

export class NoOpSessionHookRunner implements SessionHookRunner {
  async fireSessionStart(
    _source: SessionStartSource,
  ): Promise<DefaultHookOutput | undefined> {
    return undefined;
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
