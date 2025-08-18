/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn, CommandContext } from './types.js';
import { 
  ResearchFeedbackEvent, 
  logResearchFeedback, 
  getInstallationId 
} from '@google/gemini-cli-core';

export const feedbackCommand: SlashCommand = {
  name: 'feedback',
  altNames: ['research'],
  kind: CommandKind.BUILT_IN,
  description: 'Provide feedback to help improve Gemini CLI',
  action: async (context, args): Promise<MessageActionReturn> => {
    const { services } = context;
    const settings = services.settings.merged;

    // Check if user has opted into research
    if (!settings.researchOptIn) {
      return {
        type: 'message',
        messageType: 'info',
        content: `To provide feedback, please first opt-in to research participation:
  1. Run '/settings' command
  2. Enable 'Research Participation'
  3. Optionally set your contact email
  4. Try '/feedback' again

This helps us improve Gemini CLI based on user needs.`,
      };
    }

    // Simple feedback collection for MVP
    const feedback = args.trim();
    if (!feedback) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Please provide your feedback after the command:
  /feedback Your feedback here...

Example:
  /feedback The CLI is great but could use better error messages
  
Your feedback helps make Gemini CLI better for everyone!`,
      };
    }

    // Log the feedback event
    const userId = getUserId(services);
    const feedbackEvent = new ResearchFeedbackEvent(
      'conversational',
      feedback,
      undefined,
      userId,
    );
    
    // Log the telemetry event
    if (services.config && services.config.getTelemetryEnabled()) {
      logResearchFeedback(services.config, feedbackEvent);
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Thank you for your feedback! 
      
Your input: "${feedback}"

Your feedback has been recorded and will help improve Gemini CLI. ${
        settings.researchContact
          ? 'We may reach out to your provided email for follow-up research studies.'
          : 'Consider adding a contact email in settings for research study invitations.'
      }`,
    };
  },
};

// Helper function to get user ID from various auth sources
function getUserId(services: CommandContext['services']): string | undefined {
  // Use the explicitly provided contact email if available for research.
  const researchContactEmail = services.settings.merged.researchContact;
  if (researchContactEmail) {
    return researchContactEmail;
  }

  // Fall back to installation ID as a stable but privacy-preserving identifier.
  const installationId = getInstallationId();

  // getInstallationId() returns undefined on error.
  if (!installationId) {
    services.logger.logMessage('debug', 'Invalid or missing installation ID, not sending user identifier.');
    return undefined;
  }
  return installationId;
}
