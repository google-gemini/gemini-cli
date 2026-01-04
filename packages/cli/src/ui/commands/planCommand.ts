/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { PlanService, ApprovalMode } from '@google/gemini-cli-core';
import type { HistoryItemPlanList, PlanDetail } from '../types.js';
import { MessageType } from '../types.js';

/**
 * Gets the PlanService instance for the current project.
 */
const getPlanService = (context: CommandContext): PlanService => {
  const projectRoot = context.services.config?.getProjectRoot();
  return new PlanService(projectRoot);
};

/**
 * Lists all saved plans.
 */
const listCommand: SlashCommand = {
  name: 'list',
  description: 'List saved implementation plans',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context): Promise<void> => {
    const planService = getPlanService(context);
    const plans = await planService.listPlans(true);

    const planDetails: PlanDetail[] = plans.map((p) => ({
      id: p.id,
      title: p.title,
      updatedAt: p.updatedAt,
      status: p.status,
    }));

    const item: HistoryItemPlanList = {
      type: MessageType.PLAN_LIST,
      plans: planDetails,
    };

    context.ui.addItem(item, Date.now());
  },
};

/**
 * Views a saved plan.
 */
const viewCommand: SlashCommand = {
  name: 'view',
  description: 'View a saved plan. Usage: /plan view <title>',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args): Promise<SlashCommandActionReturn | void> => {
    const searchTerm = args.trim();
    if (!searchTerm) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing plan title. Usage: /plan view <title>',
      };
    }

    const planService = getPlanService(context);
    const plans = await planService.listPlans();

    // Find plan by title (case-insensitive partial match)
    const matchingPlan = plans.find((p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    if (!matchingPlan) {
      return {
        type: 'message',
        messageType: 'error',
        content: `No plan found matching "${searchTerm}".`,
      };
    }

    const planData = await planService.loadPlan(matchingPlan.id);
    if (!planData) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error loading plan "${matchingPlan.title}".`,
      };
    }

    // Display the plan content as a Gemini message
    const header = `## Plan: ${planData.metadata.title}\n\n**Status:** ${planData.metadata.status}\n**Created:** ${planData.metadata.createdAt}\n**Original prompt:** ${planData.metadata.originalPrompt}\n\n---\n\n`;

    context.ui.addItem(
      {
        type: 'gemini',
        text: header + planData.content,
      },
      Date.now(),
    );
  },
  completion: async (context, partialArg) => {
    const planService = getPlanService(context);
    const plans = await planService.listPlans();
    return plans
      .map((p) => p.title)
      .filter((title) =>
        title.toLowerCase().includes(partialArg.toLowerCase()),
      );
  },
};

/**
 * Resumes a saved plan by injecting it into context and switching to AUTO_EDIT mode.
 */
const resumeCommand: SlashCommand = {
  name: 'resume',
  altNames: ['execute'],
  description: 'Resume/execute a saved plan. Usage: /plan resume <title>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context, args): Promise<SlashCommandActionReturn | void> => {
    const searchTerm = args.trim();
    if (!searchTerm) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing plan title. Usage: /plan resume <title>',
      };
    }

    const planService = getPlanService(context);
    const plans = await planService.listPlans();

    // Find plan by title (case-insensitive partial match)
    const matchingPlan = plans.find((p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    if (!matchingPlan) {
      return {
        type: 'message',
        messageType: 'error',
        content: `No plan found matching "${searchTerm}".`,
      };
    }

    const planData = await planService.loadPlan(matchingPlan.id);
    if (!planData) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error loading plan "${matchingPlan.title}".`,
      };
    }

    // Switch to AUTO_EDIT mode for execution
    const config = context.services.config;
    if (config) {
      config.setApprovalMode(ApprovalMode.AUTO_EDIT);
    }

    // Mark plan as executed
    await planService.updatePlanStatus(matchingPlan.id, 'executed');

    // Return a prompt to be submitted with the plan as context
    const prompt = `Execute the following implementation plan. The plan was created earlier and saved. Follow the steps in the plan carefully.\n\n---\n\n# Plan: ${planData.metadata.title}\n\n${planData.content}\n\n---\n\nOriginal request: ${planData.metadata.originalPrompt}`;

    return {
      type: 'submit_prompt',
      content: prompt,
    };
  },
  completion: async (context, partialArg) => {
    const planService = getPlanService(context);
    const plans = await planService.listPlans();
    return plans
      .map((p) => p.title)
      .filter((title) =>
        title.toLowerCase().includes(partialArg.toLowerCase()),
      );
  },
};

/**
 * Deletes a saved plan.
 */
const deleteCommand: SlashCommand = {
  name: 'delete',
  description: 'Delete a saved plan. Usage: /plan delete <title>',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args): Promise<SlashCommandActionReturn | void> => {
    const searchTerm = args.trim();
    if (!searchTerm) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing plan title. Usage: /plan delete <title>',
      };
    }

    const planService = getPlanService(context);
    const plans = await planService.listPlans();

    // Find plan by title (case-insensitive partial match)
    const matchingPlan = plans.find((p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    if (!matchingPlan) {
      return {
        type: 'message',
        messageType: 'error',
        content: `No plan found matching "${searchTerm}".`,
      };
    }

    const deleted = await planService.deletePlan(matchingPlan.id);
    if (deleted) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Plan "${matchingPlan.title}" has been deleted.`,
      };
    } else {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error deleting plan "${matchingPlan.title}".`,
      };
    }
  },
  completion: async (context, partialArg) => {
    const planService = getPlanService(context);
    const plans = await planService.listPlans();
    return plans
      .map((p) => p.title)
      .filter((title) =>
        title.toLowerCase().includes(partialArg.toLowerCase()),
      );
  },
};

/**
 * Parent command for plan management.
 */
export const planCommand: SlashCommand = {
  name: 'plan',
  description: 'Manage implementation plans',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [listCommand, viewCommand, resumeCommand, deleteCommand],
};
