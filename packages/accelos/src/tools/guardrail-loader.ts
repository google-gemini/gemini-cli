import { createTool } from '@mastra/core';
import { z } from 'zod';
import { GuardrailStore } from './shared-guardrail-store.js';
import { defaultConfig, getCompatiblePaths } from '../config.js';

export const guardrailLoaderTool = createTool({
  id: 'load-guardrails',
  description: 'Manually reload guardrails from file. Note: Guardrails are automatically loaded at service startup, so this tool is typically only needed to reload after external file changes.',
  inputSchema: z.object({
    filePath: z.string().optional().describe('Path to the guardrails JSON file (uses data/guardrails.json if not provided)'),
    autoSave: z.boolean().default(true).describe('Automatically save changes to filesystem when guardrails are modified'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    loaded: z.number(),
    errors: z.array(z.string()),
    message: z.string(),
    stats: z.object({
      total: z.number(),
      byCategory: z.record(z.number()),
      bySeverity: z.record(z.number()),
    }),
  }),
  execute: async ({ context }) => {
    const { filePath = getCompatiblePaths(defaultConfig).guardrailsFile, autoSave } = context;
    const store = GuardrailStore.getInstance();

    try {
      const result = await store.loadFromFile(filePath, autoSave);
      const stats = store.getStats();

      return {
        success: true,
        loaded: result.loaded,
        errors: result.errors,
        message: `Loaded ${result.loaded} guardrails from ${filePath}${autoSave ? ' (auto-save enabled)' : ''}`,
        stats,
      };
    } catch (error) {
      return {
        success: false,
        loaded: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        message: `Failed to load guardrails from ${filePath}`,
        stats: { total: 0, byCategory: {}, bySeverity: {} },
      };
    }
  },
});