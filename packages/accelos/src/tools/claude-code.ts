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
 * Claude Code tool options schema
 */
const claudeCodeOptionsSchema = z.object({
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
  options: claudeCodeOptionsSchema.optional().describe("Optional configuration for the Claude Code session"),
});

/**
 * Output schema for the Claude Code tool
 */
const claudeCodeOutputSchema = z.object({
  result: z.string().describe("The final response from Claude Code"),
  metadata: z.object({
    turnsUsed: z.number().describe("Number of conversation turns used"),
    toolsCalled: z.array(z.string()).describe("List of tools that were called during execution"),
    sessionId: z.string().optional().describe("Session ID for multi-turn conversations"),
    hasErrors: z.boolean().describe("Whether any errors occurred during execution"),
    executionTime: z.number().describe("Execution time in milliseconds"),
  }).describe("Metadata about the Claude Code execution"),
});

/**
 * Claude Code tool for Mastra
 * 
 * This tool integrates Claude Code's capabilities into Mastra agents, allowing them to:
 * - Execute complex coding tasks
 * - Perform file operations
 * - Run shell commands
 * - Search the web
 * - Access various development tools
 * 
 * The tool streams responses from Claude Code and provides structured output with metadata.
 */
export const claudeCodeTool = createTool({
  id: "claude-code",
  description: `Execute queries using Claude Code's advanced coding capabilities. Claude Code can perform file operations, execute shell commands, search the web, and use various development tools. Useful for complex coding tasks, debugging, code analysis, and development workflows.`,
  inputSchema: claudeCodeInputSchema,
  outputSchema: claudeCodeOutputSchema,
  execute: async ({ context }) => {
    const { prompt, options = {} } = context;
    const startTime = Date.now();
    
    try {
      // Validate environment
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY environment variable is required for Claude Code tool. " +
          "Please set it to your Anthropic API key."
        );
      }

      // Prepare Claude Code options
      const claudeCodeOptions: Options = {
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

      // Stream the query and collect results
      for await (const message of query({ 
        prompt, 
        options: claudeCodeOptions 
      })) {
        if (options.debug) {
          console.log("Claude Code message:", JSON.stringify(message, null, 2));
        }

        // Handle different message types
        switch (message.type) {
          case "result":
            // Handle both success and error result types
            if (message.subtype === "success" && "result" in message) {
              result = message.result;
            } else {
              hasErrors = true;
              result = `Execution failed: ${message.subtype}`;
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
                }
                if (content.type === "tool_use") {
                  const toolName = content.name;
                  if (toolName && !toolsCalled.includes(toolName)) {
                    toolsCalled.push(toolName);
                  }
                }
              }
            }
            sessionId = message.session_id;
            break;
          }
            
          case "user":
            // Track user messages if needed
            sessionId = message.session_id;
            break;
            
          case "system":
            // Track system information
            if (message.subtype === "init") {
              sessionId = message.session_id;
              if (message.tools) {
                // Track available tools from system message
                const uniqueTools = new Set([...toolsCalled, ...message.tools]);
                toolsCalled = Array.from(uniqueTools);
              }
            }
            break;
            
          default:
            // Handle any other message types
            if (options.debug) {
              console.log("Unhandled Claude Code message type:", (message as { type?: string }).type);
            }
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        result: result || "No result returned from Claude Code",
        metadata: {
          turnsUsed,
          toolsCalled,
          sessionId,
          hasErrors,
          executionTime,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
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
        result: `Error executing Claude Code: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          turnsUsed: 0,
          toolsCalled: [],
          hasErrors: true,
          executionTime,
        },
      };
    }
  },
});