/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
export declare const settingsZodSchema: z.ZodObject<
  Record<string, z.ZodTypeAny>,
  z.UnknownKeysParam,
  z.ZodTypeAny,
  {
    [x: string]: any;
  },
  {
    [x: string]: any;
  }
>;
/**
 * Validates settings data against the Zod schema
 */
export declare function validateSettings(data: unknown): {
  success: boolean;
  data?: unknown;
  error?: z.ZodError;
};
/**
 * Format a Zod error into a helpful error message
 */
export declare function formatValidationError(
  error: z.ZodError,
  filePath: string,
): string;
