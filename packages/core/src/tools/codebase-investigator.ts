/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, Kind } from './tools.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseSubAgentInvocation } from './base-subagent-tool.js';
import type { Config } from '../config/config.js';
import type { ContextState } from '../core/subagent.js';
import { processSingleFileContent } from '../utils/fileUtils.js';
import fs from 'node:fs';

const OUTPUT_SCHEMA_JSON = `
\`\`\`json
{
    "summary_of_findings": "A brief, one-sentence summary of the architectural role of the discovered files.",
    "relevant_locations": [
        {
            "file_path": "src/services/payment_service.ts",
            "reasoning": "Contains the core business logic for processing payments and interacting with external gateways.",
            "key_symbols": ["PaymentService", "processTransaction"]
        }
    ],
    "exploration_trace": "1. Grepped for 'payment'. 2. Read 'payment_service.ts'. 3. Discovered import of 'tax_calculator.ts' and read it. 4. Grepped for 'PaymentService' to find its usage in 'payment_controller.ts'."
}
\`\`\`
`;

const SYSTEM_PROMPT = `
You are **Codebase Investigator**, a hyper-specialized AI agent and an expert in navigating complex software projects.
You are a sub-agent within a larger development system.

Your **SOLE PURPOSE** is to meticulously explore a file system and identify **ALL files and code locations** relevant to a given software development task.

You are a sub-agent in a larger system. Your only responsibility is to provide context.
- **DO:** Find relevant files.
- **DO NOT:** Write or modify code.
- **DO NOT:** Attempt to solve the user's task.
- **DO NOT:** Suggest implementation details.

You operate in a non-interactive loop and must reason based on the information provided and the output of your tools.

---

## Core Directives

<RULES>
1.  **SINGULAR FOCUS:** Your **only goal** is to identify all relevant files for the given task. You must ignore any impulse to solve the actual problem or write code. Your final output is a list of file paths and justifications, nothing more.
2.  **SYSTEMATIC EXPLORATION:** Start with broad searches (e.g., \`grep\` for keywords, \`list_files\`) and progressively narrow your focus. Think like a detective. An initial file often contains clues (imports, function calls) that lead to the next.
3.  **EFFICIENT & FINAL:** Do not stop until you are confident you have found **all** relevant context. Avoid redundant actions. Your goal is a complete, single report at the end. Do not emit partial results.
4. **Web search:** You are allowed to use the \`web_fetch\` to do web search to help you understand the context if it is available. 
</RULES>
---

## Scratchpad Management
**This is your most critical function. Your scratchpad is your memory and your plan.**
1.  **Initialization:** On your very first turn, you **MUST** create the \`<scratchpad>\` section. **Analyze the \`task\` and create an initial \`Checklist\` of high-level goals.** For example, if the mission is "add a new payment provider," your initial checklist might be \`[ ] Find existing payment provider integrations\` and \`[ ] Locate payment processing logic\`.
2.  **Constant Updates:** After **every** \`<OBSERVATION>\`, you **MUST** update the scratchpad.
    * Mark checklist items as complete: \`[x]\`.
    * **Dynamically add new checklist items** as you uncover more complexity. If you find a \`PaymentService.ts\`, you should **add a new task** like \`[ ] Analyze PaymentService.ts to find its dependencies\`.
    * Record \`Key Findings\` with the file paths and a brief note about their relevance.
    * Update \`Irrelevant Paths to Ignore\` to avoid re-investigating dead ends.
3.  **Thinking on Paper:** The scratchpad shows your work. It must always reflect your current understanding of the codebase and what your next immediate step should be.
---
## Scratchpad
For every turn, you **MUST** update your internal state based on the observation.
Scratchpad example:
<SCRATCHPAD>
**Checklist:**
- [ ] Find the main payment processing logic.
- [ ] Find the controller that handles payment API requests.
- [ ] **(New)** Analyze \`payment_service.ts\` to understand its dependencies.
- [ ] **(New)** Analyze \`payment_controller.ts\` to see how it uses the service.
**Key Findings:**
- \`payment_service.ts\` seems like a primary candidate for business logic.
- \`payment_controller.ts\` is likely the API layer.
**Irrelevant Paths to Ignore:**
- \`README.md\` is documentation, not implementation.
**Next Step:**
- I will read the contents of \`src/services/payment_service.ts\`.
</SCRATCHPAD>

## Termination

Your mission is complete **ONLY** when you have a high degree of confidence that no more relevant files can be found. Your final \`<PLAN>\` section must justify why the search is complete.

When your investigation is complete and you are confident you have found all relevant files, you MUST make a final call to the \`self.emit_value\` tool. Pass a single argument named \`report_json\` to it, containing a stringified JSON object with your complete findings. Do not call any other tools in your final turn.

\`\`\`json
{
    "summary_of_findings": "A brief, one-sentence summary of the architectural role of the discovered files.",
    "relevant_locations": [
        {
            "file_path": "src/services/payment_service.ts",
            "reasoning": "Contains the core business logic for processing payments and interacting with external gateways.",
            "key_symbols": ["PaymentService", "processTransaction"]
        }
    ],
    "exploration_trace": "1. Grepped for 'payment'. 2. Read 'payment_service.ts'. 3. Discovered import of 'tax_calculator.ts' and read it. 4. Grepped for 'PaymentService' to find its usage in 'payment_controller.ts'."
}
\`\`\`

**The task**

This is the task you have to find relevant files for:

<TASK>
\${user_objective}
</TASK>
`;

/**
 * The structured input required by the CodebaseInvestigator.
 */
export interface CodebaseInvestigatorInput {
  /** High-level summary of the user's ultimate goal. */
  user_objective: string;
  /** If true, the content of the relevant files will be included in the final report. */
  include_file_content?: boolean;
}

/**
 * The structured report generated by the Codebase Investigator subagent.
 */
export interface CodebaseInvestigatorOutput {
  /** A high-level, natural language summary of the findings. */
  summary_of_findings: string;
  /** Curated list of the most significant code locations discovered. */
  relevant_locations: Array<{
    file_path: string;
    reasoning: string;
    key_symbols: string[];
    content?: string;
  }>;
  /** A brief, human-readable log of the Investigator's main exploration steps. */
  exploration_trace: string;
}

class CodebaseInvestigatorInvocation extends BaseSubAgentInvocation<
  CodebaseInvestigatorInput,
  CodebaseInvestigatorOutput
> {
  constructor(config: Config, params: CodebaseInvestigatorInput) {
    super(config, params);
  }

  getAgentName(): string {
    return 'CodebaseInvestigator';
  }

  getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  getOutputSchemaName(): string {
    return 'CodebaseInvestigatorOutput';
  }

  override getOutputSchema(): string {
    return OUTPUT_SCHEMA_JSON;
  }

  populateContextState(contextState: ContextState): void {
    contextState.set('user_objective', this.params.user_objective);
  }

  getDescription(): string {
    return `Exploring codebase for objective: ${this.params.user_objective}`;
  }

  /**
   * Post-processes the sub-agent's report to include file content if requested.
   */

  protected convertReportToXmlString(
    report: CodebaseInvestigatorOutput,
  ): string {
    // Map each location object to its XML representation
    const locationsXml = report.relevant_locations
      .map((location) => {
        // Map each key symbol to a <Symbol> tag
        const keySymbolsXml = location.key_symbols
          .map((symbol) => `      <Symbol>${symbol}</Symbol>`)
          .join('\n');

        // If content exists, wrap it in a CDATA block to handle special characters
        const contentXml = location.content
          ? `    <Content><![CDATA[\n${location.content}\n]]></Content>\n`
          : '';

        // Assemble the XML for a single location
        return `  <Location>
      <FilePath>${location.file_path}</FilePath>
      <Reasoning>${location.reasoning}</Reasoning>
      <KeySymbols>
        ${keySymbolsXml}
      </KeySymbols>
        ${contentXml}  
      </Location>`;
      })
      .join('\n');

    // Assemble the final report
    return `<CodebaseReport>
    <SummaryOfFindings>${report.summary_of_findings}</SummaryOfFindings>
    <ExplorationTrace>${report.exploration_trace}</ExplorationTrace>
    <RelevantLocations>
  ${locationsXml}
    </RelevantLocations>
  </CodebaseReport>`;
  }

  protected override async postProcessResult(
    reportJson: string,
  ): Promise<string> {
    const report = JSON.parse(reportJson) as CodebaseInvestigatorOutput;

    for (const location of report.relevant_locations) {
      try {
        const fileStats = await fs.promises.stat(location.file_path);
        if (fileStats.isFile()) {
          const result = await processSingleFileContent(
            location.file_path,
            this.config.getTargetDir(),
            this.config.getFileSystemService(),
          );

          if (!result.error && typeof result.llmContent === 'string') {
            location.content = result.llmContent;
          }
        }
      } catch (_e) {
        // Ignore errors if file doesn't exist or is not accessible
      }
    }
    return this.convertReportToXmlString(report);
  }
}

export class CodebaseInvestigatorTool extends BaseDeclarativeTool<
  CodebaseInvestigatorInput,
  ToolResult
> {
  static readonly Name = 'codebase_investigator';

  constructor(private config: Config) {
    super(
      CodebaseInvestigatorTool.Name,
      'Codebase Investigator',
      'Delegates complex codebase exploration to an autonomous subagent. Use for vague user requests that require searching multiple files to understand a feature or find context. Returns a structured JSON report with key file paths. Can optionally include the content of found files.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          user_objective: {
            type: 'string',
            description:
              "High-level summary of the user's ultimate goal. Provides the 'north star'.",
          },
          include_file_content: {
            type: 'boolean',
            description:
              'If true, the content of the relevant files will be included in the final report.',
          },
        },
        required: ['user_objective'],
      },
      false, // isOutputMarkdown = false, as the output is structured JSON for the agent
    );
  }

  protected createInvocation(
    params: CodebaseInvestigatorInput,
  ): ToolInvocation<CodebaseInvestigatorInput, ToolResult> {
    return new CodebaseInvestigatorInvocation(this.config, params);
  }
}
