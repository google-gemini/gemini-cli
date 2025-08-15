import { z } from 'zod';
import { GuardrailStore, Guardrail } from '../tools/shared-guardrail-store.js';

const ListGuardrailsQuerySchema = z.object({
  category: z.string().optional(),
  severity: z.enum(['blocking', 'warning']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
});

export interface GuardrailListResponse {
  data: Guardrail[];
  metadata: {
    total: number;
    limit: number;
    offset: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

export interface GuardrailResponse {
  data?: Guardrail;
  error?: string;
}

export const createGuardrailsListHandler = () => {
  return async (c: any) => {
    try {
      const query = c.req.query();
      const validatedQuery = ListGuardrailsQuerySchema.parse(query);

      const store = GuardrailStore.getInstance();
      let guardrails = store.getAll();

      if (validatedQuery.category) {
        guardrails = guardrails.filter(g => g.category === validatedQuery.category);
      }

      if (validatedQuery.severity) {
        guardrails = guardrails.filter(g => g.enforcement.severity === validatedQuery.severity);
      }

      const total = guardrails.length;
      const limit = validatedQuery.limit || 50;
      const offset = validatedQuery.offset || 0;

      const paginatedGuardrails = guardrails.slice(offset, offset + limit);

      const stats = store.getStats();

      const response: GuardrailListResponse = {
        data: paginatedGuardrails,
        metadata: {
          total,
          limit,
          offset,
          byCategory: stats.byCategory,
          bySeverity: stats.bySeverity,
        },
      };

      return c.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid query parameters', details: error.errors }, 400);
      }
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
};

export const createGuardrailByIdHandler = () => {
  return async (c: any) => {
    try {
      const id = c.req.param('id');
      
      if (!id) {
        return c.json({ error: 'Guardrail ID is required' }, 400);
      }

      const store = GuardrailStore.getInstance();
      const guardrail = store.getById(id);

      if (!guardrail) {
        return c.json({ error: 'Guardrail not found' }, 404);
      }

      const response: GuardrailResponse = {
        data: guardrail,
      };

      return c.json(response);
    } catch (error) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
};