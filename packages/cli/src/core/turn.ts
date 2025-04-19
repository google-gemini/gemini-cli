import {
  Part,
  Chat,
  PartListUnion,
  GenerateContentResponse,
  FunctionCall,
} from '@google/genai';
import {
  type ToolCallConfirmationDetails,
  ToolCallStatus,
  ToolCallEvent,
} from '../ui/types.js';
import { ToolResult } from '../tools/tools.js';
import { toolRegistry } from '../tools/tool-registry.js';
import { GeminiEventType, GeminiStream } from './gemini-stream.js';

export type ToolExecutionOutcome = {
  callId: string;
  name: string;
  args: Record<string, never>;
  result?: ToolResult;
  error?: Error;
  confirmationDetails?: ToolCallConfirmationDetails;
};

// TODO(jbd): Move ToolExecutionOutcome to somewhere else?

// A turn manages the agentic loop turn.
// Turn.run emits throught the turn events that could be used
// as immediate feedback to the user.
export class Turn {
  private readonly chat: Chat;
  private pendingToolCalls: Array<{
    callId: string;
    name: string;
    args: Record<string, never>;
  }>;
  private fnResponses: Part[];
  private debugResponses: GenerateContentResponse[];

  constructor(chat: Chat) {
    this.chat = chat;
    this.pendingToolCalls = [];
    this.fnResponses = [];
    this.debugResponses = [];
  }

  async *run(req: PartListUnion, signal?: AbortSignal): GeminiStream {
    const responseStream = await this.chat.sendMessageStream({
      message: req,
    });
    for await (const resp of responseStream) {
      this.debugResponses.push(resp);
      if (signal?.aborted) {
        throw this.abortError();
      }
      if (resp.text) {
        yield {
          type: GeminiEventType.Content,
          value: resp.text,
        };
        continue;
      }
      if (!resp.functionCalls) {
        continue;
      }
      for (const fnCall of resp.functionCalls) {
        for await (const event of this.handlePendingFunctionCall(fnCall)) {
          yield event;
        }
      }

      // Create promises to be able to wait for executions to complete.
      const toolPromises = this.pendingToolCalls.map(
        async (pendingToolCall) => {
          const tool = toolRegistry.getTool(pendingToolCall.name);
          if (!tool) {
            return {
              ...pendingToolCall,
              error: new Error(
                `Tool "${pendingToolCall.name}" not found or is not registered.`,
              ),
            };
          }
          const shouldConfirm = await tool.shouldConfirmExecute(
            pendingToolCall.args,
          );
          if (shouldConfirm) {
            return {
              // TODO(jbd): Should confirm isn't confirmation details.
              ...pendingToolCall,
              confirmationDetails: shouldConfirm,
            };
          }
          const result = await tool.execute(pendingToolCall.args);
          return { ...pendingToolCall, result };
        },
      );
      const outcomes = await Promise.all(toolPromises);
      for await (const event of this.handleToolOutcomes(outcomes)) {
        yield event;
      }
      this.pendingToolCalls = [];

      // TODO(jbd): Make it harder for the caller to ignore the
      // buffered function responses.
      this.fnResponses = this.buildFunctionResponses(outcomes);
    }
  }

  private async *handlePendingFunctionCall(fnCall: FunctionCall): GeminiStream {
    const callId =
      fnCall.id ??
      `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // TODO(jbd): replace with uuid.
    const name = fnCall.name || 'undefined_tool_name';
    const args = (fnCall.args || {}) as Record<string, never>;

    this.pendingToolCalls.push({ callId, name, args });
    const value: ToolCallEvent = {
      type: 'tool_call',
      status: ToolCallStatus.Pending,
      callId,
      name,
      args,
      resultDisplay: undefined,
      confirmationDetails: undefined,
    };
    yield {
      type: GeminiEventType.ToolCallInfo,
      value,
    };
  }

  private async *handleToolOutcomes(
    outcomes: ToolExecutionOutcome[],
  ): GeminiStream {
    for (const outcome of outcomes) {
      const { callId, name, args, result, error, confirmationDetails } =
        outcome;
      if (error) {
        // TODO(jbd): Error handling needs a cleanup.
        const errorMessage = error?.message || String(error);
        yield {
          type: GeminiEventType.Content,
          value: `[Error invoking tool ${name}: ${errorMessage}]`,
        };
        return;
      }
      if (
        result &&
        typeof result === 'object' &&
        result !== null &&
        'error' in result
      ) {
        const errorMessage = String(result.error);
        yield {
          type: GeminiEventType.Content,
          value: `[Error executing tool ${name}: ${errorMessage}]`,
        };
        return;
      }
      const status = confirmationDetails
        ? ToolCallStatus.Confirming
        : ToolCallStatus.Invoked;
      const value: ToolCallEvent = {
        type: 'tool_call',
        status,
        callId,
        name,
        args,
        resultDisplay: result?.returnDisplay,
        confirmationDetails,
      };
      yield {
        type: GeminiEventType.ToolCallInfo,
        value,
      };
    }
  }

  private buildFunctionResponses(outcomes: ToolExecutionOutcome[]): Part[] {
    return outcomes.map((outcome: ToolExecutionOutcome): Part => {
      const { name, result, error } = outcome;
      const output = { output: result?.llmContent };
      let fnResponse: Record<string, unknown>;

      if (error) {
        const errorMessage = error?.message || String(error);
        fnResponse = {
          error: `Invocation failed: ${errorMessage}`,
        };
        console.error(`[Turn] Critical error invoking tool ${name}:`, error);
      } else if (
        result &&
        typeof result === 'object' &&
        result !== null &&
        'error' in result
      ) {
        fnResponse = output;
        console.warn(
          `[Turn] Tool ${name} returned an error structure:`,
          result.error,
        );
      } else {
        fnResponse = output;
      }

      return {
        functionResponse: {
          name,
          id: outcome.callId,
          response: fnResponse,
        },
      };
    });
  }

  private abortError(): Error {
    // TODO(jbd): Move it out of this class.
    const error = new Error('Request cancelled by user during stream.');
    error.name = 'AbortError';
    throw error;
  }

  getFunctionResponses(): Part[] {
    return this.fnResponses;
  }

  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }
}
