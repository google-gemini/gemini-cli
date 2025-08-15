/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { query, type Options } from "@anthropic-ai/claude-code";

/**
 * Permission modes for Claude Code
 */
const permissionModeSchema = z.enum([
  "default", // Default permission behavior
  "acceptEdits", // Accept edits without asking
  "bypassPermissions", // Bypass all permission checks
  "plan", // Plan mode only
]).describe("Permission mode for tool execution");

/**
 * Execution modes for Claude Code
 */
const executionModeSchema = z.enum([
  "basic", // Basic execution without detailed logging
  "streaming", // Streaming execution with real-time progress updates
]).describe("Execution mode - basic for production, streaming for debugging");

/**
 * Claude Code tool options schema
 */
const claudeCodeOptionsSchema = z.object({
  mode: executionModeSchema.describe("Execution mode for the tool"),
  cwd: z.string().optional().describe("Working directory for Claude Code execution (defaults to REPOSITORY_PATH env var)"),
  rcaDirectory: z.string().optional().describe("RCA directory for Claude Code execution (defaults to RCA_DIRECTORY_PATH env var)"),
  customSystemPrompt: z.string().optional().describe("Custom system prompt for the Claude Code session"),
  appendSystemPrompt: z.string().optional().describe("Additional system prompt to append"),
  maxTurns: z.number().int().positive().max(50).optional().describe("Maximum number of conversation turns (default: 20)"),
  allowedTools: z.array(z.string()).optional().describe("List of specific tools to allow (e.g., ['bash', 'read', 'write'])"),
  permissionMode: permissionModeSchema.optional().describe("Permission mode for tool execution"),
  debug: z.boolean().optional().describe("Enable debug logging"),
  model: z.string().optional().describe("Model to use for the session"),
  continue: z.boolean().optional().describe("Continue from previous session"),
  resume: z.string().optional().describe("Resume from specific session ID"),
});

/**
 * Input schema for the Claude Code tool
 */
const claudeCodeInputSchema = z.object({
  prompt: z.string().min(1).describe("The query or task to send to Claude Code"),
  options: claudeCodeOptionsSchema.describe("Configuration for the Claude Code session including execution mode"),
});

/**
 * Output schema for the Claude Code tool
 */
const claudeCodeOutputSchema = z.object({
  result: z.string().describe("The final response from Claude Code"),
  metadata: z.object({
    mode: executionModeSchema.describe("The execution mode that was used"),
    turnsUsed: z.number().describe("Number of conversation turns used"),
    toolsCalled: z.array(z.string()).describe("List of tools that were called during execution"),
    sessionId: z.string().optional().describe("Session ID for multi-turn conversations"),
    hasErrors: z.boolean().describe("Whether any errors occurred during execution"),
    executionTime: z.number().describe("Execution time in milliseconds"),
    streamingEventsEmitted: z.number().optional().describe("Number of streaming events emitted (streaming mode only)"),
  }).describe("Metadata about the Claude Code execution"),
});

/**
 * Helper function to emit progress events in streaming mode
 */
const createProgressEmitter = (onProgress: (event: any) => void) => {
  let eventCount = 0;

  const emitProgress = (type: string, payload: any) => {
    eventCount++;
    const event = {
      type: "claude-code-progress",
      payload: {
        type,
        ...payload,
        timestamp: Date.now(),
      }
    };
    
    onProgress(event);
    
    // Console logging for immediate visibility
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case 'starting':
        console.log(`🚀 [${timestamp}] Claude Code: Starting execution`);
        console.log(`   📝 Prompt: ${payload.prompt?.substring(0, 100)}${payload.prompt?.length > 100 ? '...' : ''}`);
        break;
      case 'thinking':
        console.log(`🤔 [${timestamp}] Claude Code: ${payload.message}`);
        break;
      case 'tool_use':
        console.log(`🔧 [${timestamp}] Claude Code: Using tool '${payload.toolName}'`);
        if (payload.toolInput && Object.keys(payload.toolInput).length > 0) {
          console.log(`   ⚙️  Input: ${JSON.stringify(payload.toolInput, null, 2).substring(0, 200)}${JSON.stringify(payload.toolInput).length > 200 ? '...' : ''}`);
        }
        break;
      case 'tool_result':
        console.log(`✅ [${timestamp}] Claude Code: Tool '${payload.toolName}' completed`);
        if (payload.success === false) {
          console.log(`   ❌ Error: ${payload.error}`);
        } else if (payload.result) {
          const resultStr = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result);
          console.log(`   📄 Result: ${resultStr.substring(0, 300)}${resultStr.length > 300 ? '...' : ''}`);
        }
        break;
      case 'response':
        console.log(`💬 [${timestamp}] Claude Code: ${payload.message}`);
        break;
      case 'turn_complete':
        console.log(`🔄 [${timestamp}] Claude Code: Turn ${payload.turnNumber} complete`);
        break;
      case 'session_complete':
        console.log(`✅ [${timestamp}] Claude Code: Session complete (${payload.turnsUsed} turns)`);
        break;
      case 'error':
        console.log(`❌ [${timestamp}] Claude Code: Error - ${payload.error}`);
        break;
    }
  };

  return { emitProgress, getEventCount: () => eventCount };
};

/**
 * Claude Code tool for Mastra
 * 
 * This tool integrates Claude Code's capabilities into Mastra agents with support for both
 * basic and streaming execution modes. The streaming mode provides real-time progress updates
 * and detailed logging, while basic mode focuses on efficiency.
 */
export const claudeCodeTool = createTool({
  id: "claude-code",
  description: `Execute queries using Claude Code's advanced coding capabilities with configurable execution modes. Supports basic mode for production use and streaming mode for detailed progress tracking and debugging.`,
  inputSchema: claudeCodeInputSchema,
  outputSchema: claudeCodeOutputSchema,
  execute: async ({ context }) => {
    const { prompt, options } = context;
    const { mode } = options;
    const startTime = Date.now();
    
    // Setup progress tracking for streaming mode
    let streamingEventsEmitted = 0;
    const { emitProgress, getEventCount } = createProgressEmitter(() => {
      streamingEventsEmitted++;
    });
    
    try {
      // Validate environment
      if (!process.env.ANTHROPIC_API_KEY) {
        const errorMsg = "ANTHROPIC_API_KEY environment variable is required for Claude Code tool. Please set it to your Anthropic API key.";
        
        if (mode === "streaming") {
          console.log(`❌ [${new Date().toLocaleTimeString()}] Claude Code: ${errorMsg}`);
          emitProgress('error', { error: errorMsg });
        }
        
        return {
          result: `Error: ${errorMsg}`,
          metadata: {
            mode,
            turnsUsed: 0,
            toolsCalled: [],
            hasErrors: true,
            executionTime: Date.now() - startTime,
            streamingEventsEmitted: mode === "streaming" ? getEventCount() : undefined,
          },
        };
      }

      if (mode === "streaming") {
        emitProgress('starting', { prompt });
      }

      // Determine working directory - use provided cwd, or REPOSITORY_PATH env var, or process.cwd()
      const workingDirectory = options.cwd || process.env.REPOSITORY_PATH || process.cwd();
      
      // Determine RCA directory - use provided rcaDirectory, or RCA_DIRECTORY_PATH env var, or fallback to ACCELOS_DATA_DIRECTORY_PATH/RCA
      const rcaDirectory = options.rcaDirectory || 
        process.env.RCA_DIRECTORY_PATH || 
        (process.env.ACCELOS_DATA_DIRECTORY_PATH ? `${process.env.ACCELOS_DATA_DIRECTORY_PATH}/RCA` : undefined);

      if (mode === "streaming") {
        console.log(`📁 [${new Date().toLocaleTimeString()}] Claude Code: Working directory: ${workingDirectory}`);
        if (rcaDirectory) {
          console.log(`📁 [${new Date().toLocaleTimeString()}] Claude Code: RCA directory: ${rcaDirectory}`);
        }
      }

      // Prepare Claude Code options
      const claudeCodeOptions: Options = {
        cwd: workingDirectory,
        customSystemPrompt: options.customSystemPrompt,
        appendSystemPrompt: options.appendSystemPrompt,
        maxTurns: options.maxTurns || 20,
        allowedTools: options.allowedTools,
        permissionMode: options.permissionMode || "default",
        model: options.model,
        continue: options.continue,
        resume: options.resume,
      };

      let result = "";
      let turnsUsed = 0;
      let toolsCalled: string[] = [];
      let hasErrors = false;
      let sessionId: string | undefined;
      let currentTurn = 0;

      // Stream the query and collect results
      for await (const message of query({ 
        prompt, 
        options: claudeCodeOptions 
      })) {
        if (options.debug) {
          const debugPrefix = mode === "streaming" ? "🔍 Raw Claude Code message:" : "Claude Code message:";
          console.log(debugPrefix, JSON.stringify(message, null, 2));
        }

        // Handle different message types
        switch (message.type) {
          case "result":
            // Handle both success and error result types
            if (message.subtype === "success" && "result" in message) {
              result = message.result;
              if (mode === "streaming") {
                emitProgress('session_complete', { 
                  turnsUsed: message.num_turns,
                  success: true,
                  result: message.result 
                });
              }
            } else {
              hasErrors = true;
              result = `Execution failed: ${message.subtype}`;
              if (mode === "streaming") {
                emitProgress('error', { 
                  error: `Execution failed: ${message.subtype}`,
                  turnsUsed: message.num_turns 
                });
              }
            }
            turnsUsed = message.num_turns;
            sessionId = message.session_id;
            break;
            
          case "assistant": {
            // Extract content from assistant message
            const assistantMessage = message.message;
            if (assistantMessage && Array.isArray(assistantMessage.content)) {
              for (const content of assistantMessage.content) {
                if (content.type === "text" && content.text) {
                  result += content.text;
                  if (mode === "streaming") {
                    emitProgress('response', { 
                      message: content.text,
                      turnNumber: currentTurn + 1 
                    });
                  }
                }
                if (content.type === "tool_use") {
                  const toolName = content.name;
                  const toolInput = content.input;
                  
                  if (toolName && !toolsCalled.includes(toolName)) {
                    toolsCalled.push(toolName);
                  }
                  
                  if (mode === "streaming") {
                    emitProgress('tool_use', {
                      toolName,
                      toolInput,
                      turnNumber: currentTurn + 1
                    });
                  }
                }
              }
            }
            sessionId = message.session_id;
            currentTurn++;
            if (mode === "streaming") {
              emitProgress('turn_complete', { turnNumber: currentTurn });
            }
            break;
          }
            
          case "user":
            // Track user messages
            sessionId = message.session_id;
            if (mode === "streaming") {
              emitProgress('thinking', { 
                message: "Processing user input",
                turnNumber: currentTurn + 1 
              });
            }
            break;
            
          case "system":
            // Track system information
            if (message.subtype === "init") {
              sessionId = message.session_id;
              if (message.tools) {
                const uniqueTools = new Set([...toolsCalled, ...message.tools]);
                toolsCalled = Array.from(uniqueTools);
                if (mode === "streaming") {
                  emitProgress('thinking', { 
                    message: `Initialized with ${message.tools.length} available tools: ${message.tools.join(', ')}` 
                  });
                }
              }
            }
            break;
            
          default:
            // Handle any other message types
            if (options.debug) {
              const debugPrefix = mode === "streaming" ? "🔍 Unhandled Claude Code message type:" : "Unhandled Claude Code message type:";
              console.log(debugPrefix, (message as { type?: string }).type);
              if (mode === "streaming") {
                emitProgress('thinking', { 
                  message: `Received ${(message as { type?: string }).type} message` 
                });
              }
            }
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        result: result || "No result returned from Claude Code",
        metadata: {
          mode,
          turnsUsed,
          toolsCalled,
          sessionId,
          hasErrors,
          executionTime,
          streamingEventsEmitted: mode === "streaming" ? getEventCount() : undefined,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (mode === "streaming") {
        emitProgress('error', { error: errorMsg, executionTime });
      }
      
      // Handle specific Claude Code errors
      if (error instanceof Error) {
        if (error.message.includes("ANTHROPIC_API_KEY")) {
          throw new Error(
            "Authentication failed: Please ensure ANTHROPIC_API_KEY environment variable is set correctly."
          );
        }
        
        if (error.message.includes("rate limit") || error.message.includes("quota")) {
          throw new Error(
            "Rate limit or quota exceeded: Please check your Anthropic API usage and try again later."
          );
        }
      }

      // Return structured error response
      return {
        result: `Error executing Claude Code: ${errorMsg}`,
        metadata: {
          mode,
          turnsUsed: 0,
          toolsCalled: [],
          hasErrors: true,
          executionTime,
          streamingEventsEmitted: mode === "streaming" ? getEventCount() : undefined,
        },
      };
    }
  },
});