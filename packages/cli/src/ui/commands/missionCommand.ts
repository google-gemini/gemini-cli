/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { performMission } from '@google/gemini-cli-core';
import { activateCockpitMission } from '../cockpit/CockpitState.js';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

/**
 * Command to generate a structured mission brief from a user request.
 */
export const missionCommand: SlashCommand = {
  name: 'mission',
  description: 'Generate a structured mission brief from your request.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context,
    userRequest: string,
  ): Promise<SlashCommandActionReturn> => {
    const result = performMission(userRequest);
    if (result.type === 'message') {
      return result;
    }

    activateCockpitMission(userRequest);
    context.services.agentContext?.config
      .getPolicyEngine()
      .setAutopilotMission(userRequest);

    return result;
  },
};
