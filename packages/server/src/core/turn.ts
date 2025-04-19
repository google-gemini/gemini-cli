import {
  Part,
  Chat,
  PartListUnion,
  GenerateContentResponse,
  FunctionCall,
  FunctionDeclaration,
} from '@google/genai';
// Removed UI type imports
import { ToolResult } from '../tools/tools.js'; // Keep ToolResult for now
// Removed gemini-stream import (types defined locally)

// --- Types for Server Logic ---

// Define a simpler structure for Tool execution results within the server
interface ServerToolExecutionOutcome {
  callId: string;
  name: string;
  args: Record<string, unknown>; // Use unknown for broader compatibility
  result?: ToolResult;
  error?: Error;
  // Confirmation details are handled by CLI, not server logic
}

// Define a structure for tools passed to the server
export interface ServerTool {
  name: string;
  schema: FunctionDeclaration; // Schema is needed
  // The execute method signature might differ slightly or be wrapped
  execute(params: Record<string, unknown>): Promise<ToolResult>;
  // validation and description might be handled differently or passed
}

// Redefine necessary event types locally
export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
}

interface ToolCallRequestInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

type ServerGeminiStreamEvent =
  | { type: GeminiEventType.Content; value: string }
  | { type: GeminiEventType.ToolCallRequest; value: ToolCallRequestInfo };

// --- Turn Class (Refactored for Server) ---

// A turn manages the agentic loop turn within the server context.
export class Turn {
  private readonly chat: Chat;
  private readonly availableTools: Map<string, ServerTool>; // Use passed-in tools
  private pendingToolCalls: Array<{
    callId: string;
    name: string;
    args: Record<string, unknown>; // Use unknown
  }>;
  private fnResponses: Part[];
  private debugResponses: GenerateContentResponse[];

  constructor(chat: Chat, availableTools: ServerTool[]) {
    this.chat = chat;
    this.availableTools = new Map(availableTools.map((t) => [t.name, t]));
    this.pendingToolCalls = [];
    this.fnResponses = [];
    this.debugResponses = [];
  }

  // The run method yields simpler events suitable for server logic
  async *run(
    req: PartListUnion,
    signal?: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    const responseStream = await this.chat.sendMessageStream({ message: req });

    for await (const resp of responseStream) {
      this.debugResponses.push(resp);
      if (signal?.aborted) {
        throw this.abortError();
      }
      if (resp.text) {
        yield { type: GeminiEventType.Content, value: resp.text };
        continue;
      }
      if (!resp.functionCalls) {
        continue;
      }

      // Handle function calls (requesting tool execution)
      for (const fnCall of resp.functionCalls) {
        const event = this.handlePendingFunctionCall(fnCall);
        if (event) {
          yield event;
        }
      }

      // Execute pending tool calls
      const toolPromises = this.pendingToolCalls.map(
        async (pendingToolCall): Promise<ServerToolExecutionOutcome> => {
          const tool = this.availableTools.get(pendingToolCall.name);
          if (!tool) {
            return {
              ...pendingToolCall,
              error: new Error(
                `Tool "${pendingToolCall.name}" not found or not provided to Turn.`,
              ),
            };
          }
          // No confirmation logic in the server Turn
          try {
            // TODO: Add validation step if needed (tool.validateParams?)
            const result = await tool.execute(pendingToolCall.args);
            return { ...pendingToolCall, result };
          } catch (execError: unknown) {
            return {
              ...pendingToolCall,
              error: new Error(
                `Tool execution failed: ${execError instanceof Error ? execError.message : String(execError)}`,
              ),
            };
          }
        },
      );
      const outcomes = await Promise.all(toolPromises);

      // Process outcomes and prepare function responses
      this.fnResponses = this.buildFunctionResponses(outcomes);
      this.pendingToolCalls = []; // Clear pending calls for this turn

      // If there were function responses, the caller (GeminiService) will loop
      // and call run() again with these responses.
      // If no function responses, the turn ends here.
    }
  }

  // Generates a ToolCallRequest event to signal the need for execution
  private handlePendingFunctionCall(
    fnCall: FunctionCall,
  ): ServerGeminiStreamEvent | null {
    const callId =
      fnCall.id ??
      `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = fnCall.name || 'undefined_tool_name';
    const args = (fnCall.args || {}) as Record<string, unknown>;

    this.pendingToolCalls.push({ callId, name, args });

    // Yield a request for the tool call, not the pending/confirming status
    const value: ToolCallRequestInfo = { callId, name, args };
    return { type: GeminiEventType.ToolCallRequest, value };
  }

  // Builds the Part array expected by the Google GenAI API
  private buildFunctionResponses(
    outcomes: ServerToolExecutionOutcome[],
  ): Part[] {
    return outcomes.map((outcome): Part => {
      const { name, result, error } = outcome;
      let fnResponsePayload: Record<string, unknown>;

      if (error) {
        // Format error for the LLM
        const errorMessage = error?.message || String(error);
        fnResponsePayload = { error: `Tool execution failed: ${errorMessage}` };
        console.error(`[Server Turn] Error executing tool ${name}:`, error);
      } else {
        // Pass successful tool result (content meant for LLM)
        fnResponsePayload = { output: result?.llmContent ?? '' }; // Default to empty string if no content
      }

      return {
        functionResponse: {
          name,
          id: outcome.callId,
          response: fnResponsePayload,
        },
      };
    });
  }

  private abortError(): Error {
    const error = new Error('Request cancelled by user during stream.');
    error.name = 'AbortError';
    return error; // Return instead of throw, let caller handle
  }

  // Allows the service layer to get the responses needed for the next API call
  getFunctionResponses(): Part[] {
    return this.fnResponses;
  }

  // Debugging information (optional)
  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }
}
