import { createTool } from '@mastra/core';
import { z } from 'zod';
import { GuardrailStore, GuardrailSchema } from './shared-guardrail-store.js';

export const guardrailCrudTool = createTool({
  id: 'crud-guardrails',
  description: 'Perform CRUD operations (Add, Update, Delete) on guardrails in memory',
  inputSchema: z.object({
    operation: z.enum(['list', 'add', 'update', 'delete']).describe('Operation to perform'),
    guardrailId: z.string().optional().describe('Guardrail ID (required for update/delete operations)'),
    guardrail: GuardrailSchema.omit({ created_at: true, updated_at: true }).optional().describe('Guardrail data (required for add operation, partial for update)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    operation: z.string(),
    data: z.union([GuardrailSchema, z.array(GuardrailSchema)]).optional(),
    message: z.string(),
    stats: z.object({
      total: z.number(),
      byCategory: z.record(z.number()),
      bySeverity: z.record(z.number()),
    }),
  }),
  execute: async ({ context }) => {
    const { operation, guardrailId, guardrail } = context;
    const store = GuardrailStore.getInstance();

    try {
      switch (operation) {
        case 'list': {
          const allGuardrails = store.getAll();
          return {
            success: true,
            operation: 'list',
            data: allGuardrails,
            message: `Retrieved ${allGuardrails.length} guardrails`,
            stats: store.getStats(),
          };
        }

        case 'add': {
          if (!guardrail) {
            throw new Error('guardrail data is required for add operation');
          }

          // Validate the guardrail data
          const validatedGuardrail = GuardrailSchema.omit({ created_at: true, updated_at: true }).parse(guardrail);
          
          // Check if ID already exists
          if (store.getById(validatedGuardrail.id)) {
            throw new Error(`Guardrail with ID ${validatedGuardrail.id} already exists`);
          }

          const added = await store.add(validatedGuardrail);
          return {
            success: true,
            operation: 'add',
            data: added,
            message: `Added guardrail ${added.id}`,
            stats: store.getStats(),
          };
        }

        case 'update': {
          if (!guardrailId) {
            throw new Error('guardrailId is required for update operation');
          }
          if (!guardrail) {
            throw new Error('guardrail data is required for update operation');
          }

          const updated = await store.update(guardrailId, guardrail);
          if (!updated) {
            return {
              success: false,
              operation: 'update',
              message: `Guardrail ${guardrailId} not found`,
              stats: store.getStats(),
            };
          }

          return {
            success: true,
            operation: 'update',
            data: updated,
            message: `Updated guardrail ${guardrailId}`,
            stats: store.getStats(),
          };
        }

        case 'delete': {
          if (!guardrailId) {
            throw new Error('guardrailId is required for delete operation');
          }

          const deleted = await store.delete(guardrailId);
          return {
            success: deleted,
            operation: 'delete',
            message: deleted ? `Deleted guardrail ${guardrailId}` : `Guardrail ${guardrailId} not found`,
            stats: store.getStats(),
          };
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return {
        success: false,
        operation,
        message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: store.getStats(),
      };
    }
  },
});