/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from './types.js';
import { getWizard, WIZARD_STEPS } from '@google/gemini-cli-core/onboarding';

export const wizardCommand: SlashCommand = {
  name: 'wizard',
  description: 'Quick start wizard for first-time setup',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const wizard = getWizard();

    // Parse subcommand
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'status';

    switch (subcommand) {
      case 'start':
        return startWizard(wizard);

      case 'status':
        return showStatus(wizard);

      case 'reset':
        return resetWizard(wizard);

      case 'skip':
        return skipStep(wizard);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown wizard command: ${subcommand}\n\nAvailable commands:\n  /wizard start  - Start the wizard\n  /wizard status - Show progress\n  /wizard reset  - Reset wizard\n  /wizard skip   - Skip current step`,
        };
    }
  },
};

function startWizard(wizard: any): MessageActionReturn {
  const state = wizard.getState();

  if (state.completedAt) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        '✅ You have already completed the setup wizard!\n\nRun /wizard reset to start over, or /onboarding to see your progress.',
    };
  }

  wizard.start();
  const stepDef = WIZARD_STEPS[state.currentStep];

  return {
    type: 'message',
    messageType: 'info',
    content: `🚀 **Welcome to Gemini CLI!**\n\nLet's get you set up in just a few minutes.\n\n**${stepDef.title}**\n${stepDef.description}\n\nProgress: ${wizard.getProgress()}%\n\n_Use /wizard skip to skip optional steps_`,
  };
}

function showStatus(wizard: any): MessageActionReturn {
  const state = wizard.getState();

  if (!state.startedAt) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        '👋 Welcome to Gemini CLI!\n\nRun /wizard start to begin the quick setup wizard.',
    };
  }

  if (state.completedAt) {
    const timeSpent = Math.round(wizard.getTimeSpent() / 1000);
    return {
      type: 'message',
      messageType: 'info',
      content: `✅ **Setup Complete!**\n\nYou completed the wizard in ${timeSpent} seconds.\n\nRun /onboarding to continue learning.`,
    };
  }

  const currentStep = WIZARD_STEPS[state.currentStep];
  const progress = wizard.getProgress();

  return {
    type: 'message',
    messageType: 'info',
    content: `**Quick Start Wizard**\n\nCurrent Step: ${currentStep.title}\n${currentStep.description}\n\nProgress: ${progress}%\nCompleted: ${state.completedSteps.length}/${Object.keys(WIZARD_STEPS).length} steps`,
  };
}

function resetWizard(wizard: any): MessageActionReturn {
  wizard.reset();
  return {
    type: 'message',
    messageType: 'info',
    content:
      '🔄 Wizard has been reset.\n\nRun /wizard start to begin again.',
  };
}

function skipStep(wizard: any): MessageActionReturn {
  const success = wizard.skipStep();

  if (!success) {
    return {
      type: 'message',
      messageType: 'error',
      content: '❌ Cannot skip this step - it is required.',
    };
  }

  const newStep = WIZARD_STEPS[wizard.getState().currentStep];
  return {
    type: 'message',
    messageType: 'info',
    content: `⏭️ Skipped to: ${newStep.title}\n\n${newStep.description}`,
  };
}
