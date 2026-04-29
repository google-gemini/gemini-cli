/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Supersedes stale `take_snapshot` outputs in the browser
 * subagent's conversation history. Each snapshot contains the full
 * accessibility tree and is only meaningful as the "current" page state;
 * prior snapshots are stale and waste context-window tokens.
 *
 * Called via the {@link LocalAgentDefinition.onBeforeTurn} hook before each
 * model call so the model only ever sees the most recent snapshot in full.
 */

import type { GeminiChat } from '../../core/geminiChat.js';
import type { Content, Part } from '@google/genai';
import { debugLogger } from '../../utils/debugLogger.js';

const TAKE_SNAPSHOT_TOOL_NAME = 'take_snapshot';

/**
 * Placeholder that replaces superseded snapshot outputs.
 * Kept short to minimise token cost while still being informative.
 */
export const SNAPSHOT_SUPERSEDED_PLACEHOLDER =
  '[Snapshot superseded — a newer snapshot exists later in this conversation. ' +
  'Call take_snapshot for current page state.]';

/**
 * Scans the chat history and replaces all but the most recent
 * `take_snapshot` `functionResponse` with a compact placeholder.
 *
 * No-ops when:
 * - There are fewer than 2 snapshots (nothing to supersede).
 * - All prior snapshots have already been superseded.
 *
 * Uses {@link GeminiChat.setHistory} to apply the modified history.
 */
export function supersedeStaleSnapshots(chat: GeminiChat): void {
  const history = chat.getHistory();

  // Locate all (contentIndex, partIndex) tuples for take_snapshot responses.
  const snapshotLocations: Array<{
    contentIdx: number;
    partIdx: number;
  }> = [];

  for (let i = 0; i < history.length; i++) {
    const parts = history[i].parts;
    if (!parts) continue;
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (
        part.functionResponse &&
        part.functionResponse.name === TAKE_SNAPSHOT_TOOL_NAME
      ) {
        snapshotLocations.push({ contentIdx: i, partIdx: j });
      }
    }
  }

  // Nothing to do if there are 0 or 1 snapshots.
  if (snapshotLocations.length < 2) {
    return;
  }

  // Check whether any stale snapshot actually needs replacement.
  // (Skip the last entry — that's the one we keep.)
  const staleLocations = snapshotLocations.slice(0, -1);
  const needsUpdate = staleLocations.some(({ contentIdx, partIdx }) => {
    const output = getResponseOutput(
      history[contentIdx].parts![partIdx].functionResponse?.response,
    );
    return !output.includes(SNAPSHOT_SUPERSEDED_PLACEHOLDER);
  });

  if (!needsUpdate) {
    return;
  }

  // Shallow-copy the history and replace stale snapshots.
  const newHistory: Content[] = history.map((content) => ({
    ...content,
    parts: content.parts ? [...content.parts] : undefined,
  }));

  let replacedCount = 0;

  for (const { contentIdx, partIdx } of staleLocations) {
    const originalPart = newHistory[contentIdx].parts![partIdx];
    if (!originalPart.functionResponse) continue;

    // Check if already superseded
    const output = getResponseOutput(originalPart.functionResponse.response);
    if (output.includes(SNAPSHOT_SUPERSEDED_PLACEHOLDER)) {
      continue;
    }

    const replacementPart: Part = {
      functionResponse: {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...originalPart.functionResponse,
        response: { output: SNAPSHOT_SUPERSEDED_PLACEHOLDER },
      },
    };

    newHistory[contentIdx].parts![partIdx] = replacementPart;
    replacedCount++;
  }

  if (replacedCount > 0) {
    chat.setHistory(newHistory);
    debugLogger.log(
      `[SnapshotSuperseder] Replaced ${replacedCount} stale take_snapshot output(s).`,
    );
  }
}

/**
 * Shape of a functionResponse.response that contains an `output` string.
 */
interface ResponseWithOutput {
  output: string;
}

function isResponseWithOutput(
  response: object | undefined,
): response is ResponseWithOutput {
  return (
    response !== null &&
    response !== undefined &&
    'output' in response &&
    typeof response.output === 'string'
  );
}

/**
 * Safely extracts the `output` string from a functionResponse.response object.
 * The GenAI SDK types `response` as `object | undefined`, so we need runtime
 * checks to access the `output` field.
 */
function getResponseOutput(response: object | undefined): string {
  if (isResponseWithOutput(response)) {
    return response.output;
  }
  return '';
}
