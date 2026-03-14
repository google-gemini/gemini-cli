/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  HookType,
  HookEventName,
  type RuntimeHookConfig,
  type HookInput,
} from '../hooks/types.js';
import type { Config } from '../config/config.js';
import type { ContextEngine } from './context-engine.js';

/** Typed shape of the BeforeModel hook input payload. */
interface BeforeModelHookInput extends HookInput {
  llm_request?: { contents?: Content[] };
}

/**
 * Builds a {@link RuntimeHookConfig} for the `BeforeModel` event that
 * prepends RAG context to every Gemini API request.
 *
 * Register via `Config`'s hook system after `config.initialize()`:
 * ```ts
 * const hookConfig = buildRagBeforeModelHook(contextEngine);
 * config.getHookSystem()?.registerHook(hookConfig, HookEventName.BeforeModel);
 * ```
 *
 * The hook:
 *  1. Reads `llm_request.contents` from the `BeforeModel` input payload.
 *  2. Extracts the last user turn and calls `ContextEngine.retrieveContext()`.
 *  3. If chunks are found, inserts a synthetic `<rag_context>` turn immediately
 *     before the final user message and returns it via `systemMessage`.
 *  4. If no chunks are found or the index is empty, passes through unchanged.
 *
 * @param contextEngine - A fully indexed `ContextEngine` instance.
 * @returns A `RuntimeHookConfig` for `HookEventName.BeforeModel`.
 */
export function buildRagBeforeModelHook(
  contextEngine: ContextEngine,
): RuntimeHookConfig {
  return {
    type: HookType.Runtime,
    name: 'rag-context-injector',
    action: async (rawInput) => {
      // Cast through unknown — BeforeModel input carries the llm_request field.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const input = rawInput as unknown as BeforeModelHookInput;
      const contents = input.llm_request?.contents;

      if (!contents || contents.length === 0) return;

      // Extract the last user message as the retrieval query.
      const lastUserTurn = [...contents]
        .reverse()
        .find((c) => c.role === 'user');

      if (!lastUserTurn) return;

      const queryText = lastUserTurn.parts
        ?.map((p) => ('text' in p ? p.text : ''))
        .join(' ')
        .trim();

      if (!queryText) return;

      const chunks = await contextEngine.retrieveContext(queryText);
      if (chunks.length === 0) return;

      const ragContent = contextEngine.formatAsContent(chunks);

      // Inject the RAG turn immediately before the last user message.
      const lastUserIdx = contents.lastIndexOf(lastUserTurn);
      const enrichedContents: Content[] = [
        ...contents.slice(0, lastUserIdx),
        ragContent,
        ...contents.slice(lastUserIdx),
      ];

      // systemMessage carries the enriched payload; the Turn handler applies it.
      return {
        systemMessage: JSON.stringify({ enrichedContents }),
      };
    },
  };
}

/**
 * Convenience helper: registers the RAG `BeforeModel` hook on the live
 * `HookSystem`. Must be called after `config.initialize()`.
 *
 * @param config - Initialized `Config` instance.
 * @param contextEngine - Fully indexed `ContextEngine` instance.
 */
export function registerRagHook(
  config: Config,
  contextEngine: ContextEngine,
): void {
  const hookSystem = config.getHookSystem();
  if (!hookSystem) return;

  // Correct signature: registerHook(hookConfig, eventName, options?)
  hookSystem.registerHook(
    buildRagBeforeModelHook(contextEngine),
    HookEventName.BeforeModel,
  );
}
