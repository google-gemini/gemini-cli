/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

const reportPrompt = `Create a professional markdown pentest report from the most recent tool outputs.

Constraints:
- Use only authorized assessment context.
- Do not include exploit payloads or harmful operational details.
- Prioritize HATS MCP structured findings when present.

Report format:
1) Executive Summary
2) Scope and Authorization Assumptions
3) Methodology (Recon -> Verification -> Reporting)
4) Findings Table (severity, evidence, impact, remediation)
5) Detailed Findings
6) Remediation Plan (prioritized)
7) Appendix: Last 10 tool outputs summarized`;

export const cyberReportCommand: SlashCommand = {
  name: 'report',
  description:
    'Generate a pentest report from recent tool outputs. Usage: /report [target/context]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (_context, args) => ({
    type: 'submit_prompt',
    content: args?.trim()
      ? `${reportPrompt}\n\nContext: ${args.trim()}`
      : reportPrompt,
  }),
};
