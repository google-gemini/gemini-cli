/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { Config } from '../config/config.js';
import type { LocalAgentDefinition } from './types.js';

const DesktopAgentSchema = z.object({
  action_summary: z.string().describe('Summary of the graphical actions taken.'),
});

export const DesktopAgent = (config: Config): LocalAgentDefinition<typeof DesktopAgentSchema> => ({
  kind: 'local',
  name: 'desktop_agent',
  displayName: 'Desktop Agent',
  description: 'Specialized agent for OS-level automation and GUI interaction. Uses computer control tools to interact with apps, windows, and desktop elements.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: { instruction: { type: 'string', description: 'The GUI task to perform (e.g. "open notepad and type hello").' } },
      required: ['instruction'],
    },
  },
  outputConfig: {
    outputName: 'action_summary',
    description: 'Summary of the GUI status or results.',
    schema: DesktopAgentSchema,
  },
  modelConfig: { model: 'inherit' },
  get toolConfig() {
    // Collects all relevant tools: Vision (Screenshot) + Control (Computer)
    const mcpTools = config.getToolRegistry().getAllToolNames().filter(n => 
      n.includes('screenshot') || n.includes('mouse') || n.includes('keyboard') || n.includes('click')
    );
    return { tools: ['workspace_snapshot', ...mcpTools] };
  },
  get promptConfig() {
    return {
      systemPrompt: 'You are a Desktop Automation Expert. Your goal is to navigate and control the host operating system to fulfill the user request. You rely on visual feedback (screenshots) and precise tool calls (mouse/keyboard). Always verify state via screenshot after significant moves.',
      query: 'OS Task: ${instruction}',
    };
  },
  runConfig: { maxTurns: 25 },
});
