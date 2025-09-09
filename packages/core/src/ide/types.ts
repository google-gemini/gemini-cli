/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * A file that is open in the IDE.
 */
export const FileSchema = z.object({
  /**
   * The absolute path to the file.
   */
  path: z.string(),
  /**
   * The unix timestamp of when the file was last focused.
   */
  timestamp: z.number(),
  /**
   * Whether the file is the currently active file. Only one file can be active at a time.
   */
  isActive: z.boolean().optional(),
  /**
   * The text that is currently selected in the active file.
   */
  selectedText: z.string().optional(),
  /**
   * The cursor position in the active file.
   */
  cursor: z
    .object({
      /**
       * The 1-based line number.
       */
      line: z.number(),
      /**
       * The 1-based character offset.
       */
      character: z.number(),
    })
    .optional(),
});
export type File = z.infer<typeof FileSchema>;

/**
 * The context of the IDE.
 */
export const IdeContextSchema = z.object({
  workspaceState: z
    .object({
      /**
       * The list of files that are currently open.
       */
      openFiles: z.array(FileSchema).optional(),
      /**
       * Whether the workspace is trusted.
       */
      isTrusted: z.boolean().optional(),
    })
    .optional(),
});
export type IdeContext = z.infer<typeof IdeContextSchema>;

export const IdeContextNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/contextUpdate'),
  params: IdeContextSchema,
});
