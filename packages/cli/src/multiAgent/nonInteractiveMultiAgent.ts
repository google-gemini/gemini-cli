/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, ResumedSessionData } from '@google/gemini-cli-core';
import { OutputFormat, writeToStderr } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { runNonInteractive } from '../nonInteractiveCli.js';

export type MultiAgentRole =
  | 'planner'
  | 'researcher'
  | 'coder'
  | 'tester'
  | 'reviewer';

export interface MultiAgentOptions {
  roles: MultiAgentRole[];
  maxAgents: number;
  dryRun: boolean;
}

interface RunMultiAgentParams {
  config: Config;
  settings: LoadedSettings;
  input: string;
  prompt_id: string;
  resumedSessionData?: ResumedSessionData;
  options: MultiAgentOptions;
}

const DEFAULT_ROLES: MultiAgentRole[] = [
  'planner',
  'researcher',
  'coder',
  'tester',
  'reviewer',
];

const MAX_ALLOWED_AGENTS = 5;

export function parseMultiAgentRoles(rawRoles?: string): MultiAgentRole[] {
  if (!rawRoles) return DEFAULT_ROLES;

  const allowed = new Set<MultiAgentRole>(DEFAULT_ROLES);
  const roles = rawRoles
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);

  if (roles.length === 0) return DEFAULT_ROLES;

  for (const role of roles) {
    if (!allowed.has(role as MultiAgentRole)) {
      throw new Error(
        `Invalid multi-agent role "${role}". Valid roles: ${DEFAULT_ROLES.join(
          ', ',
        )}`,
      );
    }
  }

  return [...new Set(roles)] as MultiAgentRole[];
}

export function normalizeMaxAgents(value?: number): number {
  if (value === undefined || Number.isNaN(value)) return DEFAULT_ROLES.length;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--multi-agent-max must be a positive integer.');
  }
  return Math.min(value, MAX_ALLOWED_AGENTS);
}

function buildRolePrompt(
  role: MultiAgentRole,
  userInput: string,
  dryRun: boolean,
): string {
  const safetyHeader = [
    'You are running as one role inside a conservative multi-agent CLI workflow.',
    'Respect all active CLI policy, sandbox, auth, tool approval, and workspace trust controls.',
    'Do not attempt to bypass policy, exfiltrate secrets, weaken sandboxing, or run destructive commands.',
    'Do not print secrets, tokens, private keys, environment variables, or credential files.',
    dryRun
      ? 'Dry-run mode is enabled: do not edit files or run mutating commands. Produce analysis only.'
      : 'Only make changes that are necessary for the requested task.',
  ].join('\n');

  const roleInstructions: Record<MultiAgentRole, string> = {
    planner:
      'Create a concise implementation plan. Identify security risks, required files, and test strategy. Do not edit files.',
    researcher:
      'Inspect the codebase and summarize relevant files, APIs, and constraints. Do not edit files.',
    coder:
      'Implement the planned change with the smallest safe diff. Avoid broad refactors and unsafe shell commands.',
    tester:
      'Run or recommend targeted build/typecheck/test commands. Report failures clearly. Do not hide failures.',
    reviewer:
      'Review the final state for security, correctness, regressions, missing tests, and unsafe behavior.',
  };

  return `${safetyHeader}

Role: ${role}
Role instructions:
${roleInstructions[role]}

User request:
${userInput}`;
}

export async function runNonInteractiveMultiAgent(
  params: RunMultiAgentParams,
): Promise<void> {
  const { config, settings, input, prompt_id, resumedSessionData, options } =
    params;

  const roles = options.roles.slice(0, options.maxAgents);

  if (config.getOutputFormat() === OutputFormat.TEXT) {
    writeToStderr(
      `[multi-agent] Running ${roles.length} role(s): ${roles.join(', ')}\n`,
    );
  }

  for (const role of roles) {
    if (config.getOutputFormat() === OutputFormat.TEXT) {
      writeToStderr(`[multi-agent] Starting ${role}\n`);
    }

    await runNonInteractive({
      config,
      settings,
      input: buildRolePrompt(role, input, options.dryRun),
      prompt_id: `${prompt_id}-${role}`,
      resumedSessionData,
    });

    if (config.getOutputFormat() === OutputFormat.TEXT) {
      writeToStderr(`[multi-agent] Finished ${role}\n`);
    }
  }
}
