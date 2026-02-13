/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { ClientMetadata } from '../types.js';

export interface ListExperimentsRequest {
  project: string;
  metadata?: ClientMetadata;
}

export const Int32ListSchema = z.object({
  values: z.array(z.number()).optional(),
});
export type Int32List = z.infer<typeof Int32ListSchema>;

export const StringListSchema = z.object({
  values: z.array(z.string()).optional(),
});
export type StringList = z.infer<typeof StringListSchema>;

export const FlagSchema = z.object({
  flagId: z.number().optional(),
  boolValue: z.boolean().optional(),
  floatValue: z.number().optional(),
  intValue: z.string().optional(),
  stringValue: z.string().optional(),
  int32ListValue: Int32ListSchema.optional(),
  stringListValue: StringListSchema.optional(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const FilteredFlagSchema = z.object({
  name: z.string().optional(),
  reason: z.string().optional(),
});
export type FilteredFlag = z.infer<typeof FilteredFlagSchema>;

export const ListExperimentsResponseSchema = z.object({
  experimentIds: z.array(z.number()).optional(),
  flags: z.array(FlagSchema).optional(),
  filteredFlags: z.array(FilteredFlagSchema).optional(),
  debugString: z.string().optional(),
});
export type ListExperimentsResponse = z.infer<
  typeof ListExperimentsResponseSchema
>;
