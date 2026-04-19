/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

const reportPrompt = `Create a professional markdown pentest report based on HATS framework findings and agentic hacking workflows.

Constraints:
- Use only authorized assessment context.
- Prioritize structured JSON data from HATS MCP tools.
- Include summaries of any automated HATS scripts executed during the workflow.

Report structure:
1) Executive Summary (Overall Risk Posture)
2) Scope and Authorization
3) HATS Reconnaissance Summary (Nmap, Services, Vulns)
4) Agentic Workflow Analysis (Automation and Scripting results)
5) Findings Table (Severity, Vulnerability, Evidence, Impact, Remediation)
6) Detailed Remediation Roadmap
7) Appendix: Raw HATS Tool/Script Outputs Summary`;

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
