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
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

// The corrected monorepo import pulling from your core package's front door!
import {
  getLocalMetricsSnapshot,
  localMetricReader,
} from '@google/gemini-cli-core';

export const perfCommand: SlashCommand = {
  name: 'perf',
  description:
    'View advanced engineering performance and observability metrics. Usage: /perf [latency|memory|startup]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,

  // Default action if the user just types `/perf`
  action: async (context: CommandContext) => {
    // 1. Force OTel to process the pending queue
    await localMetricReader.forceFlush();

    // 2. Await the Promise to grab the actual data payload
    const data = await getLocalMetricsSnapshot();

    // 3. Default to showing latency if no subcommand is provided
    context.ui.addItem({
      type: MessageType.PERF_LATENCY,
      data,
    } as HistoryItemPerfLatency);
  },

  subCommands: [
    {
      name: 'latency',
      description: 'Show P50/P90/P99 latencies for tools and API requests',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext) => {
        await localMetricReader.forceFlush();
        const data = await getLocalMetricsSnapshot(); // Unwraps the Promise
        context.ui.addItem({
          type: MessageType.PERF_LATENCY,
          data,
        } as HistoryItemPerfLatency);
      },
    },
    {
      name: 'memory',
      description: 'Show memory high-water marks and V8 heap usage',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext) => {
        await localMetricReader.forceFlush();
        const data = await getLocalMetricsSnapshot(); // Unwraps the Promise
        context.ui.addItem({
          type: MessageType.PERF_MEMORY,
          data,
        } as HistoryItemPerfMemory);
      },
    },
    {
      name: 'startup',
      description: 'Show the startup boot phase waterfall timings',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext) => {
        await localMetricReader.forceFlush();
        const data = await getLocalMetricsSnapshot(); // Unwraps the Promise
        context.ui.addItem({
          type: MessageType.PERF_STARTUP,
          data,
        } as HistoryItemPerfStartup);
      },
    },
  ],
};
