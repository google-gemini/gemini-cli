/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import type {
  HistoryItemPerfLatency,
  HistoryItemPerfMemory,
  HistoryItemPerfStartup,
} from '../types.js';
import { type CommandContext } from './types.js';
import {
  getLocalMetricsSnapshot,
  localMetricReader,
} from '@google/gemini-cli-core';

// Export the bare function, parsing the remaining args to determine the view
export async function handlePerfCommand(
  context: CommandContext,
  args: string[] = [],
) {
  // 1. Force OTel to process the pending queue
  await localMetricReader.forceFlush();

  // 2. Await the Promise to grab the actual data payload
  const data = await getLocalMetricsSnapshot();

  // 3. Figure out which view the user asked for
  const targetView =
    args.find((arg) => ['latency', 'memory', 'startup'].includes(arg)) ||
    'latency';

  // 4. Dispatch to the correct Ink UI component with explicit type casting
  if (targetView === 'memory') {
    context.ui.addItem({
      type: MessageType.PERF_MEMORY,
      data,
    } as HistoryItemPerfMemory);
  } else if (targetView === 'startup') {
    context.ui.addItem({
      type: MessageType.PERF_STARTUP,
      data,
    } as HistoryItemPerfStartup);
  } else {
    context.ui.addItem({
      type: MessageType.PERF_LATENCY,
      data,
    } as HistoryItemPerfLatency);
  }
}
