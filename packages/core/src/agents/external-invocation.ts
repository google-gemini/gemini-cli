/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalSubagentInvocation } from './local-invocation.js';
import {
  type ExternalAgentDefinition,
  type LocalAgentDefinition,
  type AgentInputs,
} from './types.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { type MessageBus } from '../confirmation-bus/message-bus.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

/**
 * An invocation instance for an "external" agent.
 *
 * This class applies a personality overlay to a model call to mimic
 * the behavior of an external agent provider using a standard Gemini model.
 */
export class ExternalAgentInvocation extends LocalSubagentInvocation {
  constructor(
    definition: ExternalAgentDefinition,
    context: AgentLoopContext,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    const polyfilledDefinition = polyfillExternalAgent(definition);
    super(
      polyfilledDefinition,
      context,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

/**
 * Transforms an ExternalAgentDefinition into a LocalAgentDefinition by applying
 * provider-specific personality overlays and model configurations.
 */
export function polyfillExternalAgent(
  def: ExternalAgentDefinition,
): LocalAgentDefinition {
  const overlay = getPersonalityOverlay(def.provider, def.providerConfig);

  // External agents use the instructions field (from markdown body) as their primary instructions.
  // We fall back to description if instructions are missing.
  const baseInstructions = def.instructions || def.description;

  return {
    ...def,
    kind: 'local',
    modelConfig: {
      model: DEFAULT_GEMINI_MODEL,
    },
    runConfig: {
      maxTurns: 30,
      maxTimeMinutes: 10,
    },
    promptConfig: {
      // Prepend the personality overlay to the agent's instructions.
      systemPrompt: `${overlay}\n\n${baseInstructions}`,
      query: '${query}',
    },
  };
}

/**
 * Returns a personality overlay prompt based on the external provider.
 */
function getPersonalityOverlay(
  provider: string,
  config?: Record<string, unknown>,
): string {
  const styleInstructions = config?.['styleInstructions']
    ? `\nAdditional Style Instructions: ${String(config['styleInstructions'])}`
    : '';

  switch (provider.toLowerCase()) {
    case 'claude-code':
      return `
# Claude Code Personality Overlay
You are acting as the "Claude Code" agent, a high-performance, concise, and direct coding assistant.
- Focus on efficiency and direct action.
- Use tools precisely and explain your technical reasoning briefly and only when necessary.
- Maintain a senior software engineer persona: professional, expert, and focused on clean, maintainable code.
- Avoid unnecessary conversational filler or lengthy preambles.
${styleInstructions}`.trim();

    case 'codex':
      return `
# Codex Personality Overlay
You are acting as the "Codex" agent, a specialized code generation model.
- Focus on generating high-quality, idiomatic, and correct code for the requested task.
- Prioritize structural integrity and idiomatic patterns for the target language.
- Provide clear, well-documented code snippets.
${styleInstructions}`.trim();

    case 'antigravity':
      return `
# Antigravity Personality Overlay
You are acting as the "Antigravity" agent.
- Focus on creative problem solving and thinking "outside the box".
- Adopt a playful but highly competent engineering persona.
- Encourage unconventional but effective solutions.
${styleInstructions}`.trim();

    case 'gemma':
      return `
# Gemma Personality Overlay
You are acting as the "Gemma" agent, an open, lightweight, and capable model.
- Focus on accessibility and efficiency.
- Provide helpful, clear, and easy-to-understand explanations.
- Maintain a friendly and supportive persona.
${styleInstructions}`.trim();

    default:
      return `
# External Agent Personality Overlay
You are acting as an external specialized agent ('${provider}').
Please adopt the persona, style, and expertise expected of this provider.
${styleInstructions}`.trim();
  }
}
