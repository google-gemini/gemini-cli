/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

const scanPrompt = `Run an authorized reconnaissance workflow for the provided target only.

Rules:
- Operate strictly within authorized scope and legal boundaries.
- Refuse any destructive, persistence, or unauthorized activity.
- Prefer HATS MCP tools and return structured findings.

Workflow:
1) Use hats_chain_scan when available.
2) If hats_chain_scan is unavailable, run hats_nmap_scan, then hats_service_detection, then hats_vuln_lookup.
3) Summarize findings as JSON with: target, open_ports, services, vulnerabilities, risk_level, recommended_next_steps.
4) Include confidence and explicitly mark assumptions.`;

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
