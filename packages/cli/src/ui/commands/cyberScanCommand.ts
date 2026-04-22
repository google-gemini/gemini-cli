/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

const scanPrompt = `Perform an authorized agentic reconnaissance workflow using the HATS framework.

Rules:
- Operate strictly within authorized scope and legal boundaries.
- Refuse any destructive, persistence, or unauthorized activity.
- Prioritize HATS MCP tools for structured JSON findings.
- If repetitive tasks are identified, automate them by writing a Python script using the \`hats-framework\` module.

Workflow:
1) Use hats_chain_scan for initial target profiling.
2) Enumerate services and vulnerabilities using hats_service_detection and hats_vuln_lookup.
3) Summarize findings as JSON with: target, open_ports, services, vulnerabilities, risk_level, and recommended_next_steps.
4) Provide clear remediation guidance for every discovered risk.`;

export const cyberScanCommand: SlashCommand = {
  name: 'scan',
  description:
    'Authorized recon workflow (HATS Nmap -> service detection -> vuln lookup). Usage: /scan <target>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (_context, args) => ({
    type: 'submit_prompt',
    content: args?.trim()
      ? `${scanPrompt}\n\nTarget: ${args.trim()}`
      : `${scanPrompt}\n\nTarget: <missing target>\n\nAsk the user for a target before running tools.`,
  }),
};
