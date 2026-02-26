/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const PlannerAgentSchema = z.object({
  plan_path: z
    .string()
    .describe('The path to the finalized and approved plan.'),
});

export type PlannerAgentOutput = z.infer<typeof PlannerAgentSchema>;
