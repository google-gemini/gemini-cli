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

export const DiagnosticSeveritySchema = z.enum([
  'error',
  'warning',
  'info',
  'hint',
]);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

const DiagnosticPositionSchema = z.object({
  /**
   * The 1-based line number.
   */
  line: z.number(),
  /**
   * The 1-based character offset.
   */
  character: z.number(),
});

const DiagnosticRangeSchema = z.object({
  start: DiagnosticPositionSchema,
  end: DiagnosticPositionSchema,
});

export const DiagnosticItemSchema = z.object({
  range: DiagnosticRangeSchema,
  severity: DiagnosticSeveritySchema,
  message: z.string(),
  source: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
});
export type DiagnosticItem = z.infer<typeof DiagnosticItemSchema>;

export const DiagnosticFileSchema = z.object({
  /**
   * The absolute path to the file.
   */
  path: z.string(),
  /**
   * The unix timestamp of when diagnostics were last updated.
   */
  timestamp: z.number(),
  /**
   * Diagnostic entries for this file.
   */
  items: z.array(DiagnosticItemSchema),
});
export type DiagnosticFile = z.infer<typeof DiagnosticFileSchema>;

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
      /**
       * The list of diagnostics grouped by file.
       */
      diagnostics: z.array(DiagnosticFileSchema).optional(),
    })
    .optional(),
});
export type IdeContext = z.infer<typeof IdeContextSchema>;

/**
 * A notification that the IDE context has been updated.
 */
export const IdeContextNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/contextUpdate'),
  params: IdeContextSchema,
});

/**
 * A notification that a diff has been accepted in the IDE.
 */
export const IdeDiffAcceptedNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/diffAccepted'),
  params: z.object({
    /**
     * The absolute path to the file that was diffed.
     */
    filePath: z.string(),
    /**
     * The full content of the file after the diff was accepted, which includes any manual edits the user may have made.
     */
    content: z.string(),
  }),
});

/**
 * A notification that a diff has been rejected in the IDE.
 */
export const IdeDiffRejectedNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/diffRejected'),
  params: z.object({
    /**
     * The absolute path to the file that was diffed.
     */
    filePath: z.string(),
  }),
});

/**
 * This is defined for backwards compatibility only. Newer extension versions
 * will only send IdeDiffRejectedNotificationSchema.
 *
 * A notification that a diff has been closed in the IDE.
 */
export const IdeDiffClosedNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/diffClosed'),
  params: z.object({
    filePath: z.string(),
    content: z.string().optional(),
  }),
});

/**
 * The request to open a diff view in the IDE.
 */
export const OpenDiffRequestSchema = z.object({
  /**
   * The absolute path to the file to be diffed.
   */
  filePath: z.string(),
  /**
   * The proposed new content for the file.
   */
  newContent: z.string(),
});

/**
 * The request to close a diff view in the IDE.
 */
export const CloseDiffRequestSchema = z.object({
  /**
   * The absolute path to the file to be diffed.
   */
  filePath: z.string(),
  /**
   * @deprecated
   */
  suppressNotification: z.boolean().optional(),
});
