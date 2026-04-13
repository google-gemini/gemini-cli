/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MemoryProvider,
  SessionStartPayload,
  UserInputPayload,
  ContextEvictedPayload,
  PreCompressPayload,
  TurnCompletePayload,
  IdlePayload,
  SessionEndPayload,
  MemoryProviderContext,
  MemoryEventResult,
} from './memoryProvider.js';
import { startSkillExtraction } from './memoryService.js';

/**
 * The built-in default memory provider that ships with Gemini CLI.
 *
 * Currently handles:
 * - SessionStart: runs the Skill Extraction Agent on past sessions
 *
 * Other event methods are stubs for future functionality
 * (Knowledge Preservation, save_memory persistence, Dream, etc.)
 */
export class DefaultMemoryProvider implements MemoryProvider {
  readonly name = 'default';

  async onSessionStart(
    _payload: SessionStartPayload,
    ctx: MemoryProviderContext,
  ): Promise<void> {
    // Run the existing skill extraction logic (fire-and-forget within provider)
    await startSkillExtraction(ctx.config);
  }

  async onUserInput(
    _payload: UserInputPayload,
    _ctx: MemoryProviderContext,
  ): Promise<MemoryEventResult | void> {
    // Future: inject recalled context into prompt
  }

  async onContextEvicted(
    _payload: ContextEvictedPayload,
    _ctx: MemoryProviderContext,
  ): Promise<void> {
    // Future: Knowledge Preservation — extract insights before discarding
  }

  async onPreCompress(
    _payload: PreCompressPayload,
    _ctx: MemoryProviderContext,
  ): Promise<string | void> {
    // Future: return preservation hints for the compressor
  }

  async onTurnComplete(
    _payload: TurnCompletePayload,
    _ctx: MemoryProviderContext,
  ): Promise<void> {
    // Future: save_memory persistence
  }

  async onIdle(
    _payload: IdlePayload,
    _ctx: MemoryProviderContext,
  ): Promise<void> {
    // Future: Dream?
  }

  async onSessionEnd(
    _payload: SessionEndPayload,
    _ctx: MemoryProviderContext,
  ): Promise<void> {
    // Future: flush & persist
  }
}
