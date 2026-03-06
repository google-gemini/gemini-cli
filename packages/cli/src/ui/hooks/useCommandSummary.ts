/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { summarizeCommand, type Config } from '@google/gemini-cli-core';

/**
 * Hook that provides a human-readable summary for a shell command.
 *
 * When a model-provided summary is available, it's used directly.
 * Otherwise, Flash Lite is called asynchronously to generate one.
 *
 * @param config The application config (for Gemini client access).
 * @param rawCommand The raw shell command string.
 * @param modelProvidedSummary Optional summary provided by the model.
 * @returns The best available summary, or undefined while loading.
 */
export function useCommandSummary(
  config: Config | undefined,
  rawCommand: string | undefined,
  modelProvidedSummary: string | undefined,
): string | undefined {
  const [flashLiteSummary, setFlashLiteSummary] = useState<string | undefined>(
    undefined,
  );
  const requestedCommandRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (modelProvidedSummary || !rawCommand || !config) {
      return;
    }

    if (requestedCommandRef.current === rawCommand) {
      return;
    }
    requestedCommandRef.current = rawCommand;

    const controller = new AbortController();

    summarizeCommand(
      config,
      rawCommand,
      config.getGeminiClient(),
      controller.signal,
    )
      .then((summary) => {
        if (!controller.signal.aborted && summary !== rawCommand) {
          setFlashLiteSummary(summary);
        }
      })
      .catch(() => {
        // Silently ignore failures; the raw command remains visible.
      });

    return () => {
      controller.abort();
    };
  }, [config, rawCommand, modelProvidedSummary]);

  if (modelProvidedSummary) {
    return modelProvidedSummary;
  }
  return flashLiteSummary;
}
