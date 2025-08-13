import { createTool } from '@mastra/core';
import { z } from 'zod';
import { GuardrailStore } from './shared-guardrail-store.js';

export const debugStoreTool = createTool({
  id: 'debug-store',
  description: 'Debug tool to check guardrail store state (filePath, autoSave, count)',
  inputSchema: z.object({}),
  outputSchema: z.object({
    store: z.object({
      filePath: z.string(),
      autoSave: z.boolean(),
      guardrailCount: z.number(),
    }),
    stats: z.object({
      total: z.number(),
      byCategory: z.record(z.number()),
      bySeverity: z.record(z.number()),
    }),
  }),
  execute: async () => {
    const store = GuardrailStore.getInstance();
    const debugInfo = store.getDebugInfo();
    const stats = store.getStats();
    
    console.log(`🔍 DEBUG: Store State:`, debugInfo);
    console.log(`📊 DEBUG: Store Stats:`, stats);
    
    return {
      store: debugInfo,
      stats,
    };
  },
});