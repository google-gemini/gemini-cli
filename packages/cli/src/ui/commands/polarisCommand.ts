/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkflowEngine } from "@google/gemini-cli-core";
import { MessageType } from "../types.js";
import type {
  SlashCommand,
  CommandContext,
} from "./types.js";
import { CommandKind } from "./types.js";

/**
 * A command to invoke the Polaris Phased Workflow Engine directly.
 */
export const polarisCommand: SlashCommand = {
  name: "polaris",
  description: "Invoke the Polaris Phased Workflow Engine",
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args: string) => {
    const { config } = context.services;
    const request = args.trim();

    if (!request) {
      return {
        type: "message",
        messageType: "error",
        content: "Please provide a request for the Polaris engine. Usage: /polaris <request>",
      };
    }

    if (!config) {
      return {
        type: "message",
        messageType: "error",
        content: "Config not loaded.",
      };
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: "🤖 Initializing Polaris Phased Workflow Engine...",
    });

    try {
      const engine = new WorkflowEngine(config, (activity) => {
        if (activity.type === 'THOUGHT_CHUNK' && activity.data['text']) {
           // Optional: Log thoughts if verbose
        }
        if (activity.type === 'TOOL_CALL_START') {
           context.ui.addItem({
             type: MessageType.INFO,
             text: `🛠️  ${activity.agentName} calling ${activity.data['name']}...`
           });
        }
      });
      const result = await engine.run(request, context.signal);

      return {
        type: "message",
        messageType: "info",
        content: `Polaris workflow completed with status: ${result.status}.\n\nPlan: ${result.plan.title}\n${result.plan.description}`,
      };
    } catch (error) {
      return {
        type: "message",
        messageType: "error",
        content: `Polaris engine failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
