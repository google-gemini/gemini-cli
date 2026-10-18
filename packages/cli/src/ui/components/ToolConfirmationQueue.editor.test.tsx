/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type AgentLoopContext,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
  CoreEvent,
  CoreToolCallStatus,
  Kind,
  MessageBusType,
  PolicyDecision,
  Scheduler,
  ToolConfirmationOutcome,
  coreEvents,
  makeFakeConfig,
  type ToolCall,
  type ToolCallConfirmationDetails,
  type ToolCallsUpdateMessage,
  type CompletedToolCall,
} from '@google/gemini-cli-core';
import { createMockSettings } from '../../test-utils/settings.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { UIStateContext, useUIState } from '../contexts/UIStateContext.js';
import { ToolActionsProvider } from '../contexts/ToolActionsContext.js';
import { useEditorSettings } from '../hooks/useEditorSettings.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { ToolConfirmationQueue } from './ToolConfirmationQueue.js';
import { EditorSettingsDialog } from './EditorSettingsDialog.js';

vi.mock('../editors/editorSettingsManager.js', () => ({
  editorSettingsManager: {
    getAvailableEditorDisplays: () => [
      { name: 'None', type: 'not_set', disabled: false },
      { name: 'Vim', type: 'vim', disabled: false },
    ],
  },
}));

describe('Tool confirmation while selecting an external editor', () => {
  it.each([
    ['Allow once', '1', ToolConfirmationOutcome.ProceedOnce],
    ['No, suggest changes', '3', ToolConfirmationOutcome.Cancel],
  ])(
    'returns to an actionable approval after Escape, then accepts %s',
    async (_label, key, outcome) => {
      const config = makeFakeConfig({
        interactive: true,
        usageStatisticsEnabled: false,
      });
      const messageBus = config.getMessageBus();
      vi.spyOn(config.getPolicyEngine(), 'check').mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });
      const settings = createMockSettings();
      vi.spyOn(settings, 'setValue').mockImplementation(() => {});
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      const execute = vi.fn().mockResolvedValue({
        llmContent: 'Edited package.json',
        returnDisplay: 'Edited package.json',
      });
      const details: ToolCallConfirmationDetails = {
        type: 'edit',
        title: 'Confirm edit',
        fileName: 'package.json',
        filePath: '/project/package.json',
        fileDiff:
          '--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-old\n+new',
        originalContent: 'old',
        newContent: 'new',
        isBuildFile: true,
        onConfirm,
      };
      const invocation = {
        params: {},
        getDescription: () => 'Editing package.json',
        shouldConfirmExecute: vi.fn().mockResolvedValue(details),
        execute,
      } as unknown as AnyToolInvocation;
      const tool = {
        name: 'replace',
        displayName: 'Edit',
        description: 'Editing package.json',
        kind: Kind.Edit,
        build: () => invocation,
      } as unknown as AnyDeclarativeTool;
      const context = {
        config,
        messageBus,
        toolRegistry: {
          getTool: () => tool,
          getAllToolNames: () => [tool.name],
        },
      } as unknown as AgentLoopContext;
      const scheduler = new Scheduler({
        context,
        getPreferredEditor: () => undefined,
        schedulerId: 'editor-selection-test',
      });
      const controller = new AbortController();
      const cancelRequest = vi.fn(() => controller.abort());

      function ConfirmationWithEditorDialog() {
        const uiState = useUIState();
        const [call, setCall] = useState<ToolCall>();
        const editor = useEditorSettings(settings, vi.fn(), vi.fn());

        // The stream handler can subscribe after the modal on a parent render.
        useKeypress(
          (key) => {
            if (key.name === 'escape') {
              cancelRequest();
              return true;
            }
            return false;
          },
          { isActive: true },
        );

        useEffect(() => {
          const onUpdate = (event: ToolCallsUpdateMessage) => {
            setCall(event.toolCalls[0]);
          };
          messageBus.subscribe(MessageBusType.TOOL_CALLS_UPDATE, onUpdate);
          coreEvents.on(
            CoreEvent.RequestEditorSelection,
            editor.openEditorDialog,
          );
          return () => {
            messageBus.unsubscribe(MessageBusType.TOOL_CALLS_UPDATE, onUpdate);
            coreEvents.off(
              CoreEvent.RequestEditorSelection,
              editor.openEditorDialog,
            );
          };
        }, [editor.openEditorDialog]);

        const awaiting =
          call?.status === CoreToolCallStatus.AwaitingApproval
            ? call
            : undefined;
        const toolDisplay = awaiting
          ? {
              callId: awaiting.request.callId,
              name: 'Edit',
              description: 'Editing package.json',
              resultDisplay: undefined,
              status: awaiting.status,
              confirmationDetails: awaiting.confirmationDetails,
              correlationId: awaiting.correlationId,
            }
          : undefined;

        return (
          <UIStateContext.Provider
            value={{ ...uiState, dialogsVisible: editor.isEditorDialogOpen }}
          >
            <ToolActionsProvider
              config={config}
              toolCalls={toolDisplay ? [toolDisplay] : []}
              isExpanded={() => false}
              toggleExpansion={vi.fn()}
              toggleAllExpansion={vi.fn()}
            >
              {toolDisplay && (
                <ToolConfirmationQueue
                  confirmingTool={{ tool: toolDisplay, index: 1, total: 1 }}
                />
              )}
              {editor.isEditorDialogOpen && (
                <EditorSettingsDialog
                  settings={settings}
                  onSelect={editor.handleEditorSelect}
                  onExit={editor.exitEditorDialog}
                />
              )}
            </ToolActionsProvider>
          </UIStateContext.Provider>
        );
      }

      const { stdin, lastFrame, waitUntilReady, unmount } =
        await renderWithProviders(<ConfirmationWithEditorDialog />, {
          config,
          settings,
          uiState: { terminalWidth: 100, constrainHeight: false },
        });
      let settled = false;
      let schedule: Promise<CompletedToolCall[]>;
      await act(async () => {
        schedule = scheduler
          .schedule(
            {
              callId: 'edit-build-file',
              name: tool.name,
              args: {},
              isClientInitiated: false,
              prompt_id: 'prompt',
            },
            controller.signal,
          )
          .then((result) => {
            settled = true;
            return result;
          });
      });

      try {
        await waitUntilReady();
        await waitFor(() =>
          expect(lastFrame()).toContain('Apply this change?'),
        );
        await act(async () => stdin.write('2'));
        await waitUntilReady();
        await waitFor(() => expect(lastFrame()).toContain('> Select Editor'));
        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
          ToolConfirmationOutcome.ModifyWithEditor,
          undefined,
        );
        expect(execute).not.toHaveBeenCalled();

        await act(async () => stdin.write('\x1b'));
        await waitUntilReady();
        await waitFor(() =>
          expect(lastFrame()).not.toContain('> Select Editor'),
        );
        await waitFor(() =>
          expect(invocation.shouldConfirmExecute).toHaveBeenCalledTimes(2),
        );
        expect(lastFrame()).toContain('CRITICAL SECURITY WARNING');
        expect(lastFrame()).toContain('Target: package.json');
        expect(lastFrame()).toContain('Apply this change?');
        expect(settled).toBe(false);
        expect(cancelRequest).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(settings.setValue).not.toHaveBeenCalled();
        expect(coreEvents.listenerCount(CoreEvent.EditorSelected)).toBe(0);

        await act(async () => stdin.write(key));
        await waitUntilReady();
        await waitFor(() => expect(settled).toBe(true));
        const [result] = await schedule!;
        expect(result.status).toBe(
          outcome === ToolConfirmationOutcome.ProceedOnce
            ? CoreToolCallStatus.Success
            : CoreToolCallStatus.Cancelled,
        );
        expect(onConfirm).toHaveBeenLastCalledWith(outcome, undefined);
        expect(execute).toHaveBeenCalledTimes(
          outcome === ToolConfirmationOutcome.ProceedOnce ? 1 : 0,
        );
      } finally {
        await act(async () => {
          controller.abort();
          await schedule;
        });
        scheduler.dispose();
        unmount();
      }
    },
  );
});
