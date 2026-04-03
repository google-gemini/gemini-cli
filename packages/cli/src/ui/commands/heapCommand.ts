/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
  type CommandContext,
} from './types.js';
import { HeapAnalyzer } from '@google/gemini-cli-core/src/diagnostics/heapAnalyzer.js';
import * as fs from 'fs';

export const heapCommand: SlashCommand = {
  name: 'heap',
  description: 'Analyze heap snapshots and detect memory leaks',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  
  subCommands: [
    {
      name: 'analyze',
      description: 'Analyze a single heap snapshot',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
        const filePath = args.trim();
        if (!filePath) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /heap analyze <path-to-heapsnapshot>',
          };
        }

        if (!fs.existsSync(filePath)) {
          return {
            type: 'message',
            messageType: 'error',
            content: `File not found: ${filePath}`,
          };
        }

        try {
          const snapshot = HeapAnalyzer.parseSnapshot(filePath);
          const stats = HeapAnalyzer.getStats(snapshot);
          const largeObjects = HeapAnalyzer.findLargeObjects(snapshot, 10);
          
          let output = `\n📊 Heap Snapshot Analysis: ${filePath}\n`;
          output += `   Nodes: ${stats.nodeCount.toLocaleString()}\n`;
          output += `   Edges: ${stats.edgeCount.toLocaleString()}\n`;
          output += `   Strings: ${stats.stringsCount.toLocaleString()}\n`;
          output += `   Total Heap: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB\n\n`;
          output += `🔍 Top 10 Largest Objects:\n`;
          largeObjects.forEach((obj, i) => {
            output += `   ${i+1}. ${obj.type} "${obj.name.substring(0, 50)}" - ${(obj.size / 1024).toFixed(2)} KB\n`;
          });
          
          return {
            type: 'message',
            messageType: 'info',
            content: output,
          };
        } catch (err) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Error parsing snapshot: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    },
    {
      name: 'export',
      description: 'Export heap snapshot to Perfetto format',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
        const filePath = args.trim();
        if (!filePath) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /heap export <path-to-heapsnapshot>',
          };
        }

        if (!fs.existsSync(filePath)) {
          return {
            type: 'message',
            messageType: 'error',
            content: `File not found: ${filePath}`,
          };
        }

        try {
          const snapshot = HeapAnalyzer.parseSnapshot(filePath);
          const outputPath = filePath.replace('.heapsnapshot', '.perfetto.json');
          HeapAnalyzer.exportToPerfetto(snapshot, outputPath);
          
          return {
            type: 'message',
            messageType: 'info',
            content: `✅ Exported to ${outputPath}\n📍 View at: https://ui.perfetto.dev`,
          };
        } catch (err) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Error exporting: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    },
  ],
};