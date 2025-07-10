/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import { SlashCommand, type CommandContext } from './types.js';

export const personaCommand: SlashCommand = {
  name: 'persona',
  description: 'List available personas or select a persona. Usage: /persona [name]',
  action: async (context: CommandContext, args?: string) => {
    const { services, ui } = context;
    const config = services.config;
    const settings = services.settings;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not available.',
      };
    }

    const availablePersonas = config.getPersonas();

    if (!args) {
      // List available personas
      if (availablePersonas.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No personas available. You can define personas in personas.json.',
        };
      }
      let message = 'Available personas:\n';
      availablePersonas.forEach(p => {
        message += `  - ${p.name}: ${p.description}\n`;
      });
      message += '\nTo select a persona, use: /persona <name>';
      return {
        type: 'message',
        messageType: 'info',
        content: message,
      };
    }

    // Select a persona
    const personaName = args.trim();
    const selectedPersona = availablePersonas.find(p => p.name === personaName);

    if (!selectedPersona) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Persona "${personaName}" not found. Use /persona to see available personas.`,
      };
    }

    config.setCurrentPersona(selectedPersona);
    // Persist selection to settings to remember across sessions
    settings.setValue('selectedPersona', personaName);


    return {
      type: 'message',
      messageType: 'info',
      content: `Switched to persona: ${selectedPersona.name}`,
    };
  },
  completion: async (context: CommandContext) => {
    const config = context.services.config;
    if (!config) return [];
    return config.getPersonas().map(p => p.name);
  }
};
