/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolConfirmationOutcome,
  Tool,
  ToolCallConfirmationDetails,
  ToolResult,
  ToolUIComponents,
  ToolRegistry,
  ApprovalMode,
  EditorType,
  Config,
  logToolCall,
  ToolCallEvent,
} from '../index.js';
import { Part, PartListUnion } from '@google/genai';
import { getResponseTextFromParts } from '../utils/generateContentResponseUtilities.js';
import {
  isModifiableTool,
  ModifyContext,
  modifyWithEditor,
} from '../tools/modifiable-tool.js';

export type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequestInfo;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequestInfo;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequestInfo;
  tool: Tool;
  response: ToolCallResponseInfo;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequestInfo;
  tool: Tool;
  liveOutput?: string;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type CancelledToolCall = {
  status: 'cancelled';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool: Tool;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type WaitingToolCall = {
  status: 'awaiting_approval';
  request: ToolCallRequestInfo;
  tool: Tool;
  confirmationDetails: ToolCallConfirmationDetails;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type AwaitingUserInputToolCall = {
  status: 'awaiting_user_input';
  request: ToolCallRequestInfo;
  tool: Tool;
  onUserInput: (input: string) => Promise<ToolResult>;
  uiComponents?: ToolUIComponents;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type Status = ToolCall['status'];

/**
 * Tool call states that indicate the tool has completed execution
 * and no further processing is required.
 */
const TERMINAL_STATES: Status[] = ['success', 'error', 'cancelled'];

/**
 * Tool call states that indicate the tool is still active and
 * requires further processing or user interaction.
 */
const NON_TERMINAL_STATES: Status[] = [
  'validating',
  'scheduled', 
  'executing',
  'awaiting_approval',
  'awaiting_user_input'
];

export type ToolCall =
  | ValidatingToolCall
  | ScheduledToolCall
  | ErroredToolCall
  | SuccessfulToolCall
  | ExecutingToolCall
  | CancelledToolCall
  | WaitingToolCall
  | AwaitingUserInputToolCall;

export type CompletedToolCall =
  | SuccessfulToolCall
  | CancelledToolCall
  | ErroredToolCall;

export type ConfirmHandler = (
  toolCall: WaitingToolCall,
) => Promise<ToolConfirmationOutcome>;

export type OutputUpdateHandler = (
  toolCallId: string,
  outputChunk: string,
) => void;

export type AllToolCallsCompleteHandler = (
  completedToolCalls: CompletedToolCall[],
) => void;

export type ToolCallsUpdateHandler = (toolCalls: ToolCall[]) => void;

/**
 * Formats tool output for a Gemini FunctionResponse.
 */
function createFunctionResponsePart(
  callId: string,
  toolName: string,
  output: string,
): Part {
  return {
    functionResponse: {
      id: callId,
      name: toolName,
      response: { output },
    },
  };
}

export function convertToFunctionResponse(
  toolName: string,
  callId: string,
  llmContent: PartListUnion,
): PartListUnion {
  const contentToProcess =
    Array.isArray(llmContent) && llmContent.length === 1
      ? llmContent[0]
      : llmContent;

  if (typeof contentToProcess === 'string') {
    return createFunctionResponsePart(callId, toolName, contentToProcess);
  }

  if (Array.isArray(contentToProcess)) {
    const functionResponse = createFunctionResponsePart(
      callId,
      toolName,
      'Tool execution succeeded.',
    );
    return [functionResponse, ...contentToProcess];
  }

  // After this point, contentToProcess is a single Part object.
  if (contentToProcess.functionResponse) {
    if (contentToProcess.functionResponse.response?.content) {
      const stringifiedOutput =
        getResponseTextFromParts(
          contentToProcess.functionResponse.response.content as Part[],
        ) || '';
      return createFunctionResponsePart(callId, toolName, stringifiedOutput);
    }
    // It's a functionResponse that we should pass through as is.
    return contentToProcess;
  }

  if (contentToProcess.inlineData || contentToProcess.fileData) {
    const mimeType =
      contentToProcess.inlineData?.mimeType ||
      contentToProcess.fileData?.mimeType ||
      'unknown';
    const functionResponse = createFunctionResponsePart(
      callId,
      toolName,
      `Binary content of type ${mimeType} was processed.`,
    );
    return [functionResponse, contentToProcess];
  }

  if (contentToProcess.text !== undefined) {
    return createFunctionResponsePart(callId, toolName, contentToProcess.text);
  }

  // Default case for other kinds of parts.
  return createFunctionResponsePart(
    callId,
    toolName,
    'Tool execution succeeded.',
  );
}

const createErrorResponse = (
  request: ToolCallRequestInfo,
  error: Error,
): ToolCallResponseInfo => ({
  callId: request.callId,
  error,
  responseParts: {
    functionResponse: {
      id: request.callId,
      name: request.name,
      response: { error: error.message },
    },
  },
  resultDisplay: error.message,
});

interface CoreToolSchedulerOptions {
  toolRegistry: Promise<ToolRegistry>;
  outputUpdateHandler?: OutputUpdateHandler;
  onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  onToolCallsUpdate?: ToolCallsUpdateHandler;
  approvalMode?: ApprovalMode;
  getPreferredEditor: () => EditorType | undefined;
  config: Config;
}

export class CoreToolScheduler {
  private toolRegistry: Promise<ToolRegistry>;
  private toolCalls: ToolCall[] = [];
  private outputUpdateHandler?: OutputUpdateHandler;
  private onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  private onToolCallsUpdate?: ToolCallsUpdateHandler;
  private approvalMode: ApprovalMode;
  private getPreferredEditor: () => EditorType | undefined;
  private config: Config;

  constructor(options: CoreToolSchedulerOptions) {
    this.config = options.config;
    this.toolRegistry = options.toolRegistry;
    this.outputUpdateHandler = options.outputUpdateHandler;
    this.onAllToolCallsComplete = options.onAllToolCallsComplete;
    this.onToolCallsUpdate = options.onToolCallsUpdate;
    this.approvalMode = options.approvalMode ?? ApprovalMode.DEFAULT;
    this.getPreferredEditor = options.getPreferredEditor;
  }

  private setStatusInternal(
    targetCallId: string,
    status: 'success',
    response: ToolCallResponseInfo,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'awaiting_approval',
    confirmationDetails: ToolCallConfirmationDetails,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'awaiting_user_input',
    data: { onUserInput: (input: string) => Promise<ToolResult>; uiComponents?: ToolUIComponents },
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'error',
    response: ToolCallResponseInfo,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'cancelled',
    reason: string,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'executing' | 'scheduled' | 'validating',
  ): void;
  private setStatusInternal(
    targetCallId: string,
    newStatus: Status,
    auxiliaryData?: unknown,
  ): void {
    console.log('[ENTER-DEBUG] setStatusInternal called:', { targetCallId, newStatus });
    this.toolCalls = this.toolCalls.map((currentCall) => {
      if (
        currentCall.request.callId !== targetCallId ||
        currentCall.status === 'success' ||
        currentCall.status === 'error' ||
        currentCall.status === 'cancelled'
      ) {
        return currentCall;
      }

      // currentCall is a non-terminal state here and should have startTime and tool.
      const existingStartTime = currentCall.startTime;
      const toolInstance = (
        currentCall as
          | ValidatingToolCall
          | ScheduledToolCall
          | ExecutingToolCall
          | WaitingToolCall
      ).tool;

      const outcome = (
        currentCall as
          | ValidatingToolCall
          | ScheduledToolCall
          | ExecutingToolCall
          | WaitingToolCall
      ).outcome;

      switch (newStatus) {
        case 'success': {
          const durationMs = existingStartTime
            ? Date.now() - existingStartTime
            : undefined;
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'success',
            response: auxiliaryData as ToolCallResponseInfo,
            durationMs,
            outcome,
          } as SuccessfulToolCall;
        }
        case 'error': {
          const durationMs = existingStartTime
            ? Date.now() - existingStartTime
            : undefined;
          return {
            request: currentCall.request,
            status: 'error',
            response: auxiliaryData as ToolCallResponseInfo,
            durationMs,
            outcome,
          } as ErroredToolCall;
        }
        case 'awaiting_approval':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'awaiting_approval',
            confirmationDetails: auxiliaryData as ToolCallConfirmationDetails,
            startTime: existingStartTime,
            outcome,
          } as WaitingToolCall;
        case 'awaiting_user_input':
          const awaitingInputData = auxiliaryData as { onUserInput: (input: string) => Promise<ToolResult>; uiComponents?: ToolUIComponents };
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'awaiting_user_input',
            onUserInput: awaitingInputData.onUserInput,
            uiComponents: awaitingInputData.uiComponents,
            startTime: existingStartTime,
            outcome,
          } as AwaitingUserInputToolCall;
        case 'scheduled':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'scheduled',
            startTime: existingStartTime,
            outcome,
          } as ScheduledToolCall;
        case 'cancelled': {
          const durationMs = existingStartTime
            ? Date.now() - existingStartTime
            : undefined;
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'cancelled',
            response: {
              callId: currentCall.request.callId,
              responseParts: {
                functionResponse: {
                  id: currentCall.request.callId,
                  name: currentCall.request.name,
                  response: {
                    error: `[Operation Cancelled] Reason: ${auxiliaryData}`,
                  },
                },
              },
              resultDisplay: undefined,
              error: undefined,
            },
            durationMs,
            outcome,
          } as CancelledToolCall;
        }
        case 'validating':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'validating',
            startTime: existingStartTime,
            outcome,
          } as ValidatingToolCall;
        case 'executing':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'executing',
            startTime: existingStartTime,
            outcome,
          } as ExecutingToolCall;
        default: {
          const exhaustiveCheck: never = newStatus;
          return exhaustiveCheck;
        }
      }
    });
    console.log('[ENTER-DEBUG] setStatusInternal calling notifyToolCallsUpdate');
    this.notifyToolCallsUpdate();
    console.log('[ENTER-DEBUG] setStatusInternal calling checkAndNotifyCompletion');
    this.checkAndNotifyCompletion();
  }

  private setArgsInternal(targetCallId: string, args: unknown): void {
    this.toolCalls = this.toolCalls.map((call) => {
      if (call.request.callId !== targetCallId) return call;
      return {
        ...call,
        request: { ...call.request, args: args as Record<string, unknown> },
      };
    });
  }

  private isRunning(): boolean {
    return this.toolCalls.some((call) =>
      NON_TERMINAL_STATES.includes(call.status),
    );
  }

  async schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    if (this.isRunning()) {
      throw new Error(
        'Cannot schedule new tool calls while other tool calls are actively running (executing or awaiting approval).',
      );
    }
    const requestsToProcess = Array.isArray(request) ? request : [request];
    const toolRegistry = await this.toolRegistry;

    const newToolCalls: ToolCall[] = requestsToProcess.map(
      (reqInfo): ToolCall => {
        const toolInstance = toolRegistry.getTool(reqInfo.name);
        if (!toolInstance) {
          return {
            status: 'error',
            request: reqInfo,
            response: createErrorResponse(
              reqInfo,
              new Error(`Tool "${reqInfo.name}" not found in registry.`),
            ),
            durationMs: 0,
          };
        }
        return {
          status: 'validating',
          request: reqInfo,
          tool: toolInstance,
          startTime: Date.now(),
        };
      },
    );

    this.toolCalls = this.toolCalls.concat(newToolCalls);
    this.notifyToolCallsUpdate();

    for (const toolCall of newToolCalls) {
      if (toolCall.status !== 'validating') {
        continue;
      }

      const { request: reqInfo, tool: toolInstance } = toolCall;
      try {
        if (this.approvalMode === ApprovalMode.YOLO) {
          this.setStatusInternal(reqInfo.callId, 'scheduled');
        } else {
          const confirmationDetails = await toolInstance.shouldConfirmExecute(
            reqInfo.args,
            signal,
          );

          if (confirmationDetails) {
            const originalOnConfirm = confirmationDetails.onConfirm;
            const wrappedConfirmationDetails: ToolCallConfirmationDetails = {
              ...confirmationDetails,
              onConfirm: (outcome: ToolConfirmationOutcome) =>
                this.handleConfirmationResponse(
                  reqInfo.callId,
                  originalOnConfirm,
                  outcome,
                  signal,
                ),
            };
            this.setStatusInternal(
              reqInfo.callId,
              'awaiting_approval',
              wrappedConfirmationDetails,
            );
          } else {
            this.setStatusInternal(reqInfo.callId, 'scheduled');
          }
        }
      } catch (error) {
        this.setStatusInternal(
          reqInfo.callId,
          'error',
          createErrorResponse(
            reqInfo,
            error instanceof Error ? error : new Error(String(error)),
          ),
        );
      }
    }
    this.attemptExecutionOfScheduledCalls(signal);
    this.checkAndNotifyCompletion();
  }

  async handleConfirmationResponse(
    callId: string,
    originalOnConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>,
    outcome: ToolConfirmationOutcome,
    signal: AbortSignal,
  ): Promise<void> {
    const toolCall = this.toolCalls.find(
      (c) => c.request.callId === callId && c.status === 'awaiting_approval',
    );

    if (toolCall && toolCall.status === 'awaiting_approval') {
      await originalOnConfirm(outcome);
    }

    this.toolCalls = this.toolCalls.map((call) => {
      if (call.request.callId !== callId) return call;
      return {
        ...call,
        outcome,
      };
    });

    if (outcome === ToolConfirmationOutcome.Cancel || signal.aborted) {
      this.setStatusInternal(
        callId,
        'cancelled',
        'User did not allow tool call',
      );
    } else if (outcome === ToolConfirmationOutcome.ModifyWithEditor) {
      const waitingToolCall = toolCall as WaitingToolCall;
      if (isModifiableTool(waitingToolCall.tool)) {
        const modifyContext = waitingToolCall.tool.getModifyContext(signal);
        const editorType = this.getPreferredEditor();
        if (!editorType) {
          return;
        }

        this.setStatusInternal(callId, 'awaiting_approval', {
          ...waitingToolCall.confirmationDetails,
          isModifying: true,
        } as ToolCallConfirmationDetails);

        const { updatedParams, updatedDiff } = await modifyWithEditor<
          typeof waitingToolCall.request.args
        >(
          waitingToolCall.request.args,
          modifyContext as ModifyContext<typeof waitingToolCall.request.args>,
          editorType,
          signal,
        );
        this.setArgsInternal(callId, updatedParams);
        this.setStatusInternal(callId, 'awaiting_approval', {
          ...waitingToolCall.confirmationDetails,
          fileDiff: updatedDiff,
          isModifying: false,
        } as ToolCallConfirmationDetails);
      }
    } else {
      this.setStatusInternal(callId, 'scheduled');
    }
    this.attemptExecutionOfScheduledCalls(signal);
  }

  private attemptExecutionOfScheduledCalls(signal: AbortSignal): void {
    const allCallsFinalOrScheduled = this.toolCalls.every(
      (call) =>
        call.status === 'scheduled' ||
        TERMINAL_STATES.includes(call.status) ||
        call.status === 'awaiting_user_input',
    );

    if (allCallsFinalOrScheduled) {
      const callsToExecute = this.toolCalls.filter(
        (call) => call.status === 'scheduled',
      );

      callsToExecute.forEach((toolCall) => {
        if (toolCall.status !== 'scheduled') return;

        const scheduledCall = toolCall as ScheduledToolCall;
        const { callId, name: toolName } = scheduledCall.request;
        this.setStatusInternal(callId, 'executing');

        const liveOutputCallback =
          scheduledCall.tool.canUpdateOutput && this.outputUpdateHandler
            ? (outputChunk: string) => {
                if (this.outputUpdateHandler) {
                  this.outputUpdateHandler(callId, outputChunk);
                }
                this.toolCalls = this.toolCalls.map((tc) =>
                  tc.request.callId === callId && tc.status === 'executing'
                    ? { ...(tc as ExecutingToolCall), liveOutput: outputChunk }
                    : tc,
                );
                this.notifyToolCallsUpdate();
              }
            : undefined;

        scheduledCall.tool
          .execute(scheduledCall.request.args, signal, liveOutputCallback)
          .then((toolResult: ToolResult) => {
            if (signal.aborted) {
              this.setStatusInternal(
                callId,
                'cancelled',
                'User cancelled tool execution.',
              );
              return;
            }

            // Check if tool is awaiting user input
            if (toolResult.awaitingUserInput && toolResult.onUserInput) {
              this.setStatusInternal(callId, 'awaiting_user_input', {
                onUserInput: toolResult.onUserInput,
                uiComponents: toolResult.uiComponents,
              });
              return;
            }

            const response = convertToFunctionResponse(
              toolName,
              callId,
              toolResult.llmContent,
            );

            const successResponse: ToolCallResponseInfo = {
              callId,
              responseParts: response,
              resultDisplay: toolResult.returnDisplay,
              error: undefined,
              uiComponents: toolResult.uiComponents, // UIコンポーネント情報を追加
            };
            this.setStatusInternal(callId, 'success', successResponse);
          })
          .catch((executionError: Error) => {
            this.setStatusInternal(
              callId,
              'error',
              createErrorResponse(
                scheduledCall.request,
                executionError instanceof Error
                  ? executionError
                  : new Error(String(executionError)),
              ),
            );
          });
      });
    }
  }

  /**
   * Checks if all tool calls have reached a terminal state and notifies completion.
   * Terminal states are: 'success', 'error', 'cancelled'
   * Non-terminal states that should keep the scheduler active: 
   * 'awaiting_user_input', 'awaiting_approval', 'executing', 'validating', 'scheduled'
   */
  private checkAndNotifyCompletion(): void {
    console.log('[ENTER-DEBUG] checkAndNotifyCompletion called, current tools:', 
      this.toolCalls.map(call => ({ callId: call.request.callId, status: call.status })));
    
    const allCallsAreTerminal = this.toolCalls.every((call) =>
      TERMINAL_STATES.includes(call.status),
    );

    console.log('[ENTER-DEBUG] All calls terminal?', allCallsAreTerminal);

    if (this.toolCalls.length > 0 && allCallsAreTerminal) {
      console.log('[ENTER-DEBUG] Clearing toolCalls and notifying completion');
      const completedCalls = [...this.toolCalls] as CompletedToolCall[];
      this.toolCalls = [];

      for (const call of completedCalls) {
        logToolCall(this.config, new ToolCallEvent(call));
      }

      if (this.onAllToolCallsComplete) {
        this.onAllToolCallsComplete(completedCalls);
      }
      this.notifyToolCallsUpdate();
    }
  }

  private notifyToolCallsUpdate(): void {
    if (this.onToolCallsUpdate) {
      this.onToolCallsUpdate([...this.toolCalls]);
    }
  }

  /**
   * Handle user input for a tool call that is awaiting user input.
   * This method should only be called when a tool is in 'awaiting_user_input' state.
   * @param callId The ID of the tool call awaiting user input
   * @param userInput The input provided by the user
   */
  async handleUserInput(callId: string, userInput: string): Promise<void> {
    console.log('[ENTER-DEBUG] Core.handleUserInput called:', { callId, userInput });
    
    const allToolCalls = this.toolCalls.map(call => ({ 
      callId: call.request.callId, 
      status: call.status 
    }));
    console.log('[ENTER-DEBUG] Current tool states:', allToolCalls);
    
    const toolCall = this.toolCalls.find(
      (call) => call.request.callId === callId && call.status === 'awaiting_user_input',
    );

    if (!toolCall || toolCall.status !== 'awaiting_user_input') {
      console.warn(`[ENTER-DEBUG] Tool call ${callId} is not awaiting user input. Found tool:`, 
        toolCall ? { callId: toolCall.request.callId, status: toolCall.status } : 'NOT_FOUND');
      throw new Error(`Tool call ${callId} is not awaiting user input. Current status: ${toolCall?.status || 'NOT_FOUND'}`);
    }

    const awaitingInputCall = toolCall as AwaitingUserInputToolCall;
    try {
      console.log('[ENTER-DEBUG] Core.handleUserInput processing user input...');
      const finalResult = await awaitingInputCall.onUserInput(userInput);
      console.log('[ENTER-DEBUG] Core.handleUserInput got result, setting to success');
      
      const response = convertToFunctionResponse(
        awaitingInputCall.request.name,
        callId,
        finalResult.llmContent,
      );

      const successResponse: ToolCallResponseInfo = {
        callId,
        responseParts: response,
        resultDisplay: finalResult.returnDisplay,
        error: undefined,
        uiComponents: finalResult.uiComponents,
      };
      
      this.setStatusInternal(callId, 'success', successResponse);
      console.log('[ENTER-DEBUG] Core.handleUserInput completed successfully');
    } catch (error) {
      this.setStatusInternal(
        callId,
        'error',
        createErrorResponse(
          awaitingInputCall.request,
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }
}
