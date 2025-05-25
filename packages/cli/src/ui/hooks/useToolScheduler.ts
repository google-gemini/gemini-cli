/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolConfirmationOutcome,
  Tool,
  ToolCallConfirmationDetails,
} from '@gemini-code/server';
import { Part } from '@google/genai';
import { useCallback, useEffect, useState } from 'react';
import {
  HistoryItemToolGroup,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';

type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequestInfo;
  tool: Tool;
};

type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequestInfo;
  tool: Tool;
};

type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
};

type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequestInfo;
  tool: Tool;
  response: ToolCallResponseInfo;
};

type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequestInfo;
  tool: Tool;
};

type CancelledToolCall = {
  status: 'cancelled';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool: Tool;
};

type WaitingToolCall = {
  status: 'awaiting_approval';
  request: ToolCallRequestInfo;
  tool: Tool;
  confirmationDetails: ToolCallConfirmationDetails;
};

export type Status = ToolCall['status'];

export type ToolCall =
  | ValidatingToolCall
  | ScheduledToolCall
  | ErroredToolCall
  | SuccessfulToolCall
  | ExecutingToolCall
  | CancelledToolCall
  | WaitingToolCall;

export type ScheduleFn = (
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
) => void;
export type CancelFn = () => void;
export type CompletedToolCall =
  | SuccessfulToolCall
  | CancelledToolCall
  | ErroredToolCall;

export function useToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => void,
  config: Config,
): [ToolCall[], ScheduleFn, CancelFn] {
  const [toolRegistry] = useState(() => config.getToolRegistry());
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [abortController, setAbortController] = useState<AbortController>(
    () => new AbortController(),
  );

  const isRunning = toolCalls.some(
    (t) => t.status === 'executing' || t.status === 'awaiting_approval',
  );
  // Note: request array[] typically signal pending tool calls
  const schedule = useCallback(
    async (request: ToolCallRequestInfo | ToolCallRequestInfo[]) => {
      if (isRunning) {
        throw new Error(
          'Cannot schedule tool calls while other tool calls are running',
        );
      }
      const requestsToProcess = Array.isArray(request) ? request : [request];

      // Step 1: Create initial calls with 'validating' status (or 'error' if tool not found)
      // and add them to the state immediately to make the UI busy.
      const initialNewCalls: ToolCall[] = requestsToProcess.map(
        (r): ToolCall => {
          const tool = toolRegistry.getTool(r.name);
          if (!tool) {
            return {
              status: 'error',
              request: r,
              response: toolErrorResponse(
                r,
                new Error(`tool ${r.name} does not exist`),
              ),
            };
          }
          // Set to 'validating' immediately. This will make streamingState 'Responding'.
          return { status: 'validating', request: r, tool };
        },
      );
      setToolCalls((prevCalls) => prevCalls.concat(initialNewCalls));

      // Step 2: Asynchronously check for confirmation and update status for each new call.
      initialNewCalls.forEach(async (initialCall) => {
        // If the call was already marked as an error (tool not found), skip further processing.
        if (initialCall.status !== 'validating') return;

        const { request: r, tool } = initialCall;
        try {
          const userApproval = await tool.shouldConfirmExecute(r.args);
          if (userApproval) {
            // Confirmation is needed. Update status to 'awaiting_approval'.
            setToolCalls(
              setStatus(r.callId, 'awaiting_approval', {
                ...userApproval,
                onConfirm: async (outcome) => {
                  // This onConfirm is triggered by user interaction later.
                  await userApproval.onConfirm(outcome);
                  setToolCalls(
                    outcome === ToolConfirmationOutcome.Cancel
                      ? setStatus(
                          r.callId,
                          'cancelled',
                          'User did not allow tool call',
                        )
                      : // If confirmed, it goes to 'scheduled' to be picked up by the execution effect.
                        setStatus(r.callId, 'scheduled'),
                  );
                },
              }),
            );
          } else {
            // No confirmation needed, move to 'scheduled' for execution.
            setToolCalls(setStatus(r.callId, 'scheduled'));
          }
        } catch (e) {
          // Handle errors from tool.shouldConfirmExecute() itself.
          setToolCalls(
            setStatus(
              r.callId,
              'error',
              toolErrorResponse(
                r,
                e instanceof Error ? e : new Error(String(e)),
              ),
            ),
          );
        }
      });
    },
    [isRunning, setToolCalls, toolRegistry],
  );

  const cancel = useCallback(
    (reason: string = 'unspecified') => {
      abortController.abort();
      setAbortController(new AbortController());
      setToolCalls((tc) =>
        tc.map((c) =>
          c.status !== 'error'
            ? {
                ...c,
                status: 'cancelled',
                response: {
                  callId: c.request.callId,
                  responsePart: {
                    functionResponse: {
                      id: c.request.callId,
                      name: c.request.name,
                      response: {
                        error: `[Operation Cancelled] Reason: ${reason}`,
                      },
                    },
                  },
                  resultDisplay: undefined,
                  error: undefined,
                },
              }
            : c,
        ),
      );
    },
    [abortController],
  );

  useEffect(() => {
    // effect for executing scheduled tool calls
    const allToolsConfirmed = toolCalls.every(
      (t) => t.status === 'scheduled' || t.status === 'cancelled',
    );
    if (allToolsConfirmed) {
      const signal = abortController.signal;
      toolCalls
        .filter((t) => t.status === 'scheduled')
        .forEach((t) => {
          const callId = t.request.callId;
          setToolCalls(setStatus(t.request.callId, 'executing'));
          t.tool
            .execute(t.request.args, signal)
            .then((result) => {
              if (signal.aborted) {
                setToolCalls(
                  setStatus(callId, 'cancelled', 'Cancelled during execution'),
                );
                return;
              }
              const functionResponse: Part = {
                functionResponse: {
                  name: t.request.name,
                  id: callId,
                  response: { output: result.llmContent },
                },
              };
              const response: ToolCallResponseInfo = {
                callId,
                responsePart: functionResponse,
                resultDisplay: result.returnDisplay,
                error: undefined,
              };
              setToolCalls(setStatus(callId, 'success', response));
            })
            .catch((e) =>
              setToolCalls(
                setStatus(
                  callId,
                  'error',
                  toolErrorResponse(
                    t.request,
                    e instanceof Error ? e : new Error(String(e)),
                  ),
                ),
              ),
            );
        });
    }
  }, [toolCalls, toolRegistry, abortController.signal]);

  useEffect(() => {
    const allDone = toolCalls.every(
      (t) =>
        t.status === 'success' ||
        t.status === 'error' ||
        t.status === 'cancelled',
    );
    if (toolCalls.length && allDone) {
      setToolCalls([]);
      onComplete(toolCalls);
      setAbortController(() => new AbortController());
    }
  }, [toolCalls, onComplete]);

  return [toolCalls, schedule, cancel];
}

function setStatus(
  targetCallId: string,
  status: 'success',
  response: ToolCallResponseInfo,
): (t: ToolCall[]) => ToolCall[];
function setStatus(
  targetCallId: string,
  status: 'awaiting_approval',
  confirm: ToolCallConfirmationDetails,
): (t: ToolCall[]) => ToolCall[];
function setStatus(
  targetCallId: string,
  status: 'error',
  response: ToolCallResponseInfo,
): (t: ToolCall[]) => ToolCall[];
function setStatus(
  targetCallId: string,
  status: 'cancelled',
  reason: string,
): (t: ToolCall[]) => ToolCall[];
function setStatus(
  targetCallId: string,
  status: 'executing' | 'scheduled' | 'validating',
): (t: ToolCall[]) => ToolCall[];
function setStatus(
  targetCallId: string,
  status: Status,
  auxiliaryData?: unknown,
): (t: ToolCall[]) => ToolCall[] {
  return function (tc: ToolCall[]): ToolCall[] {
    return tc.map((t) => {
      if (t.request.callId !== targetCallId || t.status === 'error') {
        return t;
      }
      switch (status) {
        case 'success': {
          const next: SuccessfulToolCall = {
            ...t,
            status: 'success',
            response: auxiliaryData as ToolCallResponseInfo,
          };
          return next;
        }
        case 'error': {
          const next: ErroredToolCall = {
            ...t,
            status: 'error',
            response: auxiliaryData as ToolCallResponseInfo,
          };
          return next;
        }
        case 'awaiting_approval': {
          const next: WaitingToolCall = {
            ...t,
            status: 'awaiting_approval',
            confirmationDetails: auxiliaryData as ToolCallConfirmationDetails,
          };
          return next;
        }
        case 'scheduled': {
          const next: ScheduledToolCall = {
            ...t,
            status: 'scheduled',
          };
          return next;
        }
        case 'cancelled': {
          const next: CancelledToolCall = {
            ...t,
            status: 'cancelled',
            response: {
              callId: t.request.callId,
              responsePart: {
                functionResponse: {
                  id: t.request.callId,
                  name: t.request.name,
                  response: {
                    error: `[Operation Cancelled] Reason: ${auxiliaryData}`,
                  },
                },
              },
              resultDisplay: undefined,
              error: undefined,
            },
          };
          return next;
        }
        case 'validating': {
          const next: ValidatingToolCall = {
            ...(t as ValidatingToolCall), // Added type assertion for safety
            status: 'validating',
          };
          return next;
        }
        case 'executing': {
          const next: ExecutingToolCall = {
            ...t,
            status: 'executing',
          };
          return next;
        }
        default: {
          // ensures every case is checked for above
          const exhaustiveCheck: never = status;
          return exhaustiveCheck;
        }
      }
    });
  };
}

const toolErrorResponse = (
  request: ToolCallRequestInfo,
  error: Error,
): ToolCallResponseInfo => ({
  callId: request.callId,
  error,
  responsePart: {
    functionResponse: {
      id: request.callId,
      name: request.name,
      response: { error: error.message },
    },
  },
  resultDisplay: error.message,
});

function mapStatus(status: Status): ToolCallStatus {
  switch (status) {
    case 'validating':
      return ToolCallStatus.Executing;
    case 'awaiting_approval':
      return ToolCallStatus.Confirming;
    case 'executing':
      return ToolCallStatus.Executing;
    case 'success':
      return ToolCallStatus.Success;
    case 'cancelled':
      return ToolCallStatus.Canceled;
    case 'error':
      return ToolCallStatus.Error;
    case 'scheduled':
      return ToolCallStatus.Pending;
    default: {
      // ensures every case is checked for above
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

// convenient function for callers to map ToolCall back to a HistoryItem
export function mapToDisplay(
  tool: ToolCall[] | ToolCall,
): HistoryItemToolGroup {
  const tools = Array.isArray(tool) ? tool : [tool];
  const toolsDisplays = tools.map((t): IndividualToolCallDisplay => {
    switch (t.status) {
      case 'success':
        return {
          callId: t.request.callId,
          name: t.tool.displayName,
          description: t.tool.getDescription(t.request.args),
          resultDisplay: t.response.resultDisplay,
          status: mapStatus(t.status),
          confirmationDetails: undefined,
        };
      case 'error':
        return {
          callId: t.request.callId,
          name: t.request.name,
          description: '',
          resultDisplay: t.response.resultDisplay,
          status: mapStatus(t.status),
          confirmationDetails: undefined,
        };
      case 'cancelled':
        return {
          callId: t.request.callId,
          name: t.tool.displayName,
          description: t.tool.getDescription(t.request.args),
          resultDisplay: t.response.resultDisplay,
          status: mapStatus(t.status),
          confirmationDetails: undefined,
        };
      case 'awaiting_approval':
        return {
          callId: t.request.callId,
          name: t.tool.displayName,
          description: t.tool.getDescription(t.request.args),
          resultDisplay: undefined,
          status: mapStatus(t.status),
          confirmationDetails: t.confirmationDetails,
        };
      case 'executing':
        return {
          callId: t.request.callId,
          name: t.tool.displayName,
          description: t.tool.getDescription(t.request.args),
          resultDisplay: undefined,
          status: mapStatus(t.status),
          confirmationDetails: undefined,
        };
      case 'validating': // Add this case
        return {
          callId: t.request.callId,
          name: t.tool.displayName,
          description: t.tool.getDescription(t.request.args),
          resultDisplay: undefined,
          status: mapStatus(t.status),
          confirmationDetails: undefined,
        };
      case 'scheduled':
        return {
          callId: t.request.callId,
          name: t.tool.displayName,
          description: t.tool.getDescription(t.request.args),
          resultDisplay: undefined,
          status: mapStatus(t.status),
          confirmationDetails: undefined,
        };
      default: {
        // ensures every case is checked for above
        const exhaustiveCheck: never = t;
        return exhaustiveCheck;
      }
    }
  });
  const historyItem: HistoryItemToolGroup = {
    type: 'tool_group',
    tools: toolsDisplays,
  };
  return historyItem;
}
