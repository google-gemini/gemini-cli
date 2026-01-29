/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import type { EditorType } from '../utils/editor.js';
import {
  isModifiableDeclarativeTool,
  modifyWithEditor,
  type ModifyContext,
} from '../tools/modifiable-tool.js';
import type { ToolConfirmationPayload } from '../tools/tools.js';
import type { WaitingToolCall } from './types.js';

export interface ModificationResult {
  updatedParams: Record<string, unknown>;
  updatedDiff?: string;
}

export class ToolModificationHandler {
  /**
   * Handles the "Modify with Editor" flow where an external editor is launched
   * to modify the tool's parameters.
   */
  async handleModifyWithEditor(
    toolCall: WaitingToolCall,
    editorType: EditorType,
    signal: AbortSignal,
  ): Promise<ModificationResult | undefined> {
    if (!isModifiableDeclarativeTool(toolCall.tool)) {
      return undefined;
    }

    const confirmationDetails = toolCall.confirmationDetails;
    const modifyContext = toolCall.tool.getModifyContext(signal);

    const contentOverrides =
      confirmationDetails.type === 'edit'
        ? {
            currentContent: confirmationDetails.originalContent,
            proposedContent: confirmationDetails.newContent,
          }
        : undefined;

    const { updatedParams, updatedDiff } = await modifyWithEditor<
      typeof toolCall.request.args
    >(
      toolCall.request.args,
      modifyContext as ModifyContext<typeof toolCall.request.args>,
      editorType,
      signal,
      contentOverrides,
    );

    return {
      updatedParams,
      updatedDiff,
    };
  }

  /**
   * Applies user-provided inline content updates (e.g. from the chat UI).
   */
  async applyInlineModify(
    toolCall: WaitingToolCall,
    payload: ToolConfirmationPayload,
    signal: AbortSignal,
  ): Promise<ModificationResult | undefined> {
    if (
      toolCall.confirmationDetails.type !== 'edit' ||
      !payload.newContent ||
      !isModifiableDeclarativeTool(toolCall.tool)
    ) {
      return undefined;
    }

    const modifyContext = toolCall.tool.getModifyContext(
      signal,
    ) as ModifyContext<typeof toolCall.request.args>;
    const currentContent = await modifyContext.getCurrentContent(
      toolCall.request.args,
    );

    const updatedParams = modifyContext.createUpdatedParams(
      currentContent,
      payload.newContent,
      toolCall.request.args,
    );

    const updatedDiff = Diff.createPatch(
      modifyContext.getFilePath(toolCall.request.args),
      currentContent,
      payload.newContent,
      'Current',
      'Proposed',
    );

    return {
      updatedParams,
      updatedDiff,
    };
  }
}
