/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from './types.js';
import { getWorkflowEngine } from '@google/gemini-cli-core/workflows';

export const workflowCommand: SlashCommand = {
  name: 'workflow',
  description: 'Execute and manage workflow templates',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const engine = getWorkflowEngine();

    // Parse subcommand
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'list';

    switch (subcommand) {
      case 'list':
        return listWorkflows(engine, parts[1]);

      case 'show':
        return showWorkflow(engine, parts[1]);

      case 'run':
        return runWorkflow(engine, parts[1], parts.slice(2));

      case 'stats':
        return showStats(engine);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown command: ${subcommand}\n\nAvailable commands:\n  /workflow list [category]   - List all workflows\n  /workflow show <id>         - Show workflow details\n  /workflow run <id> [vars]   - Execute a workflow\n  /workflow stats             - Show execution statistics`,
        };
    }
  },
};

function listWorkflows(engine: any, category?: string): MessageActionReturn {
  const workflows = engine.getWorkflows();

  let filtered = workflows;
  if (category) {
    filtered = workflows.filter((w: any) => w.category === category);
  }

  // Group by category
  const byCategory: Record<string, any[]> = {};
  filtered.forEach((w: any) => {
    const cat = w.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(w);
  });

  const categories = Object.keys(byCategory).sort();
  const sections = categories.map((cat) => {
    const items = byCategory[cat]
      .map((w: any) => `  • **${w.id}** - ${w.description}`)
      .join('\n');
    return `**${cat.charAt(0).toUpperCase() + cat.slice(1)}**\n${items}`;
  });

  return {
    type: 'message',
    messageType: 'info',
    content: `⚙️  **Available Workflows** (${filtered.length})\n\n${sections.join('\n\n')}\n\n_Show details: /workflow show <id>_\n_Run workflow: /workflow run <id>_`,
  };
}

function showWorkflow(engine: any, workflowId: string): MessageActionReturn {
  if (!workflowId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a workflow ID.\n\nExample: /workflow show code-review',
    };
  }

  const workflow = engine.getWorkflow(workflowId);
  if (!workflow) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Workflow not found: ${workflowId}\n\nRun /workflow list to see available workflows.`,
    };
  }

  const steps = workflow.steps
    .map(
      (s: any, i: number) =>
        `${i + 1}. **${s.name}** (${s.type})\n   ${s.command || s.prompt || s.workflow || ''}`,
    )
    .join('\n\n');

  let content = `⚙️  **${workflow.name}**\n\n${workflow.description}\n\nVersion: ${workflow.version}\nCategory: ${workflow.category || 'general'}\n`;

  if (workflow.tags && workflow.tags.length > 0) {
    content += `Tags: ${workflow.tags.join(', ')}\n`;
  }

  if (workflow.variables) {
    const vars = Object.entries(workflow.variables)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    content += `\n**Default Variables:**\n${vars}\n`;
  }

  content += `\n**Steps:**\n${steps}\n\n_Run: /workflow run ${workflowId}_`;

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

async function runWorkflow(
  engine: any,
  workflowId: string,
  varArgs: string[],
): Promise<MessageActionReturn> {
  if (!workflowId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a workflow ID.\n\nExample: /workflow run code-review',
    };
  }

  const workflow = engine.getWorkflow(workflowId);
  if (!workflow) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Workflow not found: ${workflowId}`,
    };
  }

  // Parse variables from args (format: key=value)
  const variables: Record<string, string> = {};
  varArgs.forEach((arg) => {
    const [key, ...valueParts] = arg.split('=');
    if (key && valueParts.length > 0) {
      variables[key] = valueParts.join('=');
    }
  });

  try {
    const execution = await engine.executeWorkflow(workflowId, variables);

    const results = execution.results
      .map(
        (r: any) =>
          `${r.status === 'success' ? '✅' : '❌'} ${r.stepId}\n   ${r.output || r.error || ''}`,
      )
      .join('\n\n');

    const duration = execution.completedAt
      ? execution.completedAt - execution.startedAt
      : 0;

    return {
      type: 'message',
      messageType: execution.status === 'completed' ? 'success' : 'error',
      content: `**Workflow Execution: ${workflow.name}**\n\nStatus: ${execution.status}\nDuration: ${duration}ms\n\n**Results:**\n${results}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to execute workflow: ${error.message}`,
    };
  }
}

function showStats(engine: any): MessageActionReturn {
  const stats = engine.getStats();

  return {
    type: 'message',
    messageType: 'info',
    content: `📊 **Workflow Statistics**\n\nTotal workflows: ${stats.totalWorkflows}\nExecutions: ${stats.executionCount}\nSuccessful: ${stats.successCount}\nFailed: ${stats.failureCount}\n\n_View workflows: /workflow list_`,
  };
}
