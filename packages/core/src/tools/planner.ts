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
  "summary_of_analysis": "To add the new discount endpoint, we must modify the main API router, add a new business logic method to the 'InvoiceService', and create a new handler in the 'InvoiceController'.",
  "solution_strategy": "The approach is to add a new PUT route. The controller will receive the request, call the InvoiceService to fetch the invoice, apply the 10% discount logic within the service, save the updated invoice, and return it.",
  "relevant_locations": [
      {
          "file_path": "src/services/invoice_service.ts",
          "reasoning": "Contains the core business logic for processing invoices and interacting with external gateways.",
          "key_symbols": ["InvoiceService", "invoiceRepository", "aplyDiscount"]
      },
      {
          "file_path": "src/controllers/invoice_controller.ts",
          "reasoning": "Contains controller logic for processing invoices.",
          "key_symbols": ["applyDiscountHandler", "InvoiceController"]
      },
      {
          "file_path": "src/routes/api_v2_router.ts",
          "reasoning": "Important to  find the route group for invoices.",
          "key_symbols": ["invoiceController"]
      }
  ],
  "step_by_step_plan": [
    {
      "step_number": 1,
      "action": "MODIFY_FILE",
      "file_path": "src/services/invoice_service.ts",
      "description": "In the 'InvoiceService' class, add a new async public method: 'applyDiscount(invoiceId: string)'. This method must: 1. Fetch the invoice by ID using the 'invoiceRepository'. 2. Check if the invoice exists, throw error if not. 3. Calculate the new total (currentTotal * 0.90). 4. Update the invoice object's 'total' field. 5. Save the updated invoice using 'this.invoiceRepository.save(invoice)'. 6. Return the updated invoice.",
      "expected_outcome": "The 'InvoiceService' class now has a 'applyDiscount' method with the correct business logic."
    },
    {
      "step_number": 2,
      "action": "MODIFY_FILE",
      "file_path": "src/controllers/invoice_controller.ts",
      "description": "In the 'InvoiceController' class, create a new handler method 'applyDiscountHandler(req, res)'. This handler should: 1. Extract 'invoiceId' from req.params. 2. Call 'this.invoiceService.applyDiscount(invoiceId)' inside a try/catch block. 3. On success, send the updated invoice as a 200 JSON response. 4. On error, send a 404 or 500 status with the error message.",
      "expected_outcome": "The controller has a new public method to handle the HTTP request and call the service logic."
    },
    {
      "step_number": 3,
      "action": "MODIFY_FILE",
      "file_path": "src/routes/api_v2_router.ts",
      "description": "At the top of the file, ensure 'invoiceController' is imported. Find the route group for invoices. Add a new PUT route: 'router.put("/invoice/discount/:invoiceId", (req, res) => invoiceController.applyDiscountHandler(req, res));'.",
      "expected_outcome": "The API server now exposes the new 'PUT /api/v2/invoice/discount/:invoiceId' endpoint."
    }
  ]
}
\`\`\`
`

const SYSTEM_PROMPT = `
You are **Solution Planner**, an expert AI agent specializing in full-stack software engineering, system design, and meticulous implementation planning.
You are a sub-agent within a larger development system.
You are very diligent, pay attention to details and execute deep investigations and planning.

Your **DUAL PURPOSE** is to:
1.  **Investigate:** Meticulously explore the codebase to identify ALL files, classes, functions, and data structures relevant to a given task.
2.  **Plan:** Create a comprehensive, step-by-step implementation plan that is sufficiently detailed for another agent (an execution agent) to follow precisely to solve the task. Provide the reasoning for each step of the plan and make sure you considered all alternatives and choose the best and simplest one.

You are a planner, not an executor.
- **DO:** Find relevant files and analyze code.
- **DO:** Create a highly detailed, sequential plan of action.
- **DO NOT:** Write, edit, or modify any files yourself. Your output is the plan, not the code.
- **DO NOT:** Attempt to execute the plan.

---

## Core Directives

<RULES>
1.  **DUAL-PHASE OPERATION:** Your process must follow two phases:
    * **Phase 1: Investigation.** Use your tools (\`grep\`, \`list_files\`, \`read_file\`) to explore the codebase. Understand the architecture, find relevant logic, and identify all points of modification.
    * **Phase 2: Planning.** Based on your complete investigation, formulate a detailed, step-by-step plan. This plan must be literal and specific. Do not use abstract suggestions; provide concrete instructions.

2.  **ACTIONABLE PLAN:** The final "step_by_step_plan" is the most critical output. It must be a sequence of discrete actions (like "MODIFY_FILE", "CREATE_FILE") targeting specific file paths, with clear descriptions of *exactly what logic* to add or change. An execution agent must be able to complete the task using *only* your plan.

3.  **COMPLETENESS:** Do not terminate until you have both (A) fully investigated all relevant code paths and (B) created a complete implementation plan that addresses the entire user task.
</RULES>

---

## Scratchpad Management

**This is your most critical function. Your scratchpad is your memory and your plan.**

1.  **Initialization:** On your very first turn, create the \`<scratchpad>\`. Analyze the \`task\` and create an initial \`Checklist\` that covers BOTH investigation and planning.
    * *Example Task:* "Add a caching layer to the user profile service."
    * *Example Initial Checklist:*
        - [ ] Find the current user profile service.
        - [ ] Identify where the profile service is called.
        - [ ] Check if a caching utility (e.g., Redis client) already exists.
        - [ ] Formulate a plan to modify the user profile service to include caching logic.
        - [ ] Formulate a plan to update any related configuration.

2.  **Constant Updates:** After **every** \`<OBSERVATION>\`, you **MUST** update the scratchpad.
    * Mark checklist items complete: \`[x]\`.
    * Add new, more granular tasks as you discover things.
    * Record \`Key Findings\` (e.g., "\`UserService.ts\` in \`src/services\` contains the \`getUserProfile\` method and is the main target.")
    * Once investigation is complete (all investigation checklist items are \`[x]\`), your "Next Step" should pivot to plan formulation.

---

## Scratchpad Example

<SCRATCHPAD>
**Checklist:**
- [x] Find the main invoice processing logic.
- [x] Find the API controller that handles invoice creation.
- [x] Identified \`InvoiceService.ts\` and \`InvoiceController.ts\`.
- [ ] **(New)** Formulate plan step 1: Modify \`InvoiceService.ts\` to add new discount logic.
- [ ] **(New)** Formulate plan step 2: Modify \`InvoiceController.ts\` to expose the logic.
- [ ] **(New)** Formulate plan step 3: Modify \`api_router.ts\` to add the new route.

**Key Findings:**
- \`src/services/InvoiceService.ts\`: Contains the \`createInvoice\` and \`getInvoice\` methods. This is where the core logic change must happen.
- \`src/controllers/InvoiceController.ts\`: Handles the HTTP requests and calls the service. Needs a new handler method.
- \`src/routes/api_router.ts\`: Main router file where the new endpoint path must be registered.

**Next Step:**
- My investigation is complete. I have all necessary files. I will now construct the final, step-by-step implementation plan and then terminate.
</SCRATCHPAD>

---

## Termination and Plan Schema

When your investigation is complete AND your plan is formulated, you MUST make a final call to the \`self.emit_value\` tool. Pass a single argument named \`report_json\` to it, containing a stringified JSON object with your complete Solution Plannerure.

**THIS JSON IS YOUR *ONLY* OUTPUT. IT MUST BE PERFECT.**

Here is an example for a task: "Add a new '/api/v2/invoice/discount' endpoint that applies a 10% discount to an invoice ID."

\`\`\`json
{
  "summary_of_analysis": "To add the new discount endpoint, we must modify the main API router, add a new business logic method to the 'InvoiceService', and create a new handler in the 'InvoiceController'.",
  "solution_strategy": "The approach is to add a new PUT route. The controller will receive the request, call the InvoiceService to fetch the invoice, apply the 10% discount logic within the service, save the updated invoice, and return it.",
  "relevant_locations": [
      {
          "file_path": "src/services/invoice_service.ts",
          "reasoning": "Contains the core business logic for processing invoices and interacting with external gateways.",
          "key_symbols": ["InvoiceService", "invoiceRepository", "aplyDiscount"]
      },
      {
          "file_path": "src/controllers/invoice_controller.ts",
          "reasoning": "Contains controller logic for processing invoices.",
          "key_symbols": ["applyDiscountHandler", "InvoiceController"]
      },
      {
          "file_path": "src/routes/api_v2_router.ts",
          "reasoning": "Important to  find the route group for invoices.",
          "key_symbols": ["invoiceController"]
      }
  ],
  "step_by_step_plan": [
    {
      "step_number": 1,
      "action": "MODIFY_FILE",
      "file_path": "src/services/invoice_service.ts",
      "description": "In the 'InvoiceService' class, add a new async public method: 'applyDiscount(invoiceId: string)'. This method must: 1. Fetch the invoice by ID using the 'invoiceRepository'. 2. Check if the invoice exists, throw error if not. 3. Calculate the new total (currentTotal * 0.90). 4. Update the invoice object's 'total' field. 5. Save the updated invoice using 'this.invoiceRepository.save(invoice)'. 6. Return the updated invoice.",
      "expected_outcome": "The 'InvoiceService' class now has a 'applyDiscount' method with the correct business logic."
    },
    {
      "step_number": 2,
      "action": "MODIFY_FILE",
      "file_path": "src/controllers/invoice_controller.ts",
      "description": "In the 'InvoiceController' class, create a new handler method 'applyDiscountHandler(req, res)'. This handler should: 1. Extract 'invoiceId' from req.params. 2. Call 'this.invoiceService.applyDiscount(invoiceId)' inside a try/catch block. 3. On success, send the updated invoice as a 200 JSON response. 4. On error, send a 404 or 500 status with the error message.",
      "expected_outcome": "The controller has a new public method to handle the HTTP request and call the service logic."
    },
    {
      "step_number": 3,
      "action": "MODIFY_FILE",
      "file_path": "src/routes/api_v2_router.ts",
      "description": "At the top of the file, ensure 'invoiceController' is imported. Find the route group for invoices. Add a new PUT route: 'router.put("/invoice/discount/:invoiceId", (req, res) => invoiceController.applyDiscountHandler(req, res));'.",
      "expected_outcome": "The API server now exposes the new 'PUT /api/v2/invoice/discount/:invoiceId' endpoint."
    }
  ]
}
\`\`\`

**The task**

This is the task you must investigate and plan for:

<TASK>
\${user_objective}
</TASK>
`;

/**
 * The structured input required by the SolutionPlanner.
 */
export interface SolutionPlannerInput {
  /** High-level summary of the user's ultimate goal. Provides the "north star". */
  user_objective: string;
  /** If true, the content of the relevant files will be included in the final report. */
  include_file_content?: boolean;
}

/**
 * The structured implementation plan generated by the Solution Planner subagent.
 * This is the primary deliverable, intended for an execution agent.
 */
export interface SolutionPlannerOutput {
  /** A high-level summary of the investigation and the proposed technical solution. */
  summary_of_analysis: string;
  /** The overall technical approach or strategy for the solution. */
  solution_strategy: string;
  /** The detailed, step-by-step implementation plan for an execution agent to follow. */
  step_by_step_plan: Array<{
    step_number: number;
    /** The type of operation required (e.g., "MODIFY_FILE", "CREATE_FILE", "VERIFY_LOGIC"). */
    action: string;
    /** The specific file to act upon. */
    file_path: string;
    /** Detailed, literal instructions for the execution agent. */
    description: string;
    /** What should be true after this step is successfully completed. */
    expected_outcome: string;
  }>;

  relevant_locations: Array<{
    file_path: string;
    reasoning: string;
    key_symbols: string[];
    content?: string;
  }>;
}

class SolutionPlannerInvocation extends BaseSubAgentInvocation<
  SolutionPlannerInput,
  SolutionPlannerOutput
> {
  constructor(config: Config, params: SolutionPlannerInput) {
    super(config, params);
  }

  getAgentName(): string {
    return 'Solution Planner';
  }

  getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  getOutputSchemaName(): string {
    return 'SolutionPlannerOutput';
  }

  override getOutputSchema(): string {
    return OUTPUT_SCHEMA_JSON;
  }

  populateContextState(contextState: ContextState): void {
    contextState.set('user_objective', this.params.user_objective);
  }

  getDescription(): string {
    return `Planning solution for objective: ${this.params.user_objective}`;
  }
  private convertSolutionPlanToXmlString(
    report: SolutionPlannerOutput,
  ): string {
    // Convert the list of key files to an XML block
    const keyFilesXml = report.relevant_locations
      .map(
        (file) => `    <File>
      <FilePath>${file.file_path}</FilePath>
      <Reasoning>${file.reasoning}</Reasoning>
    </File>`,
      )
      .join('\n');

    // Convert the newly added relevant locations to an XML block
    const locationsXml = report.relevant_locations
      .map((location) => {
        const keySymbolsXml = location.key_symbols
          .map((symbol) => `        <Symbol>${symbol}</Symbol>`)
          .join('\n');

        const contentXml = location.content
          ? `      <Content><![CDATA[\n${location.content}\n]]></Content>\n`
          : '';

        return `    <Location>
      <FilePath>${location.file_path}</FilePath>
      <Reasoning>${location.reasoning}</Reasoning>
      <KeySymbols>
${keySymbolsXml}
      </KeySymbols>
${contentXml}    </Location>`;
      })
      .join('\n');

    // Convert the detailed step-by-step plan to an XML block
    const stepsXml = report.step_by_step_plan
      .map(
        (step) => `    <Step>
      <StepNumber>${step.step_number}</StepNumber>
      <Action>${step.action}</Action>
      <FilePath>${step.file_path}</FilePath>
      <Description>${step.description}</Description>
      <ExpectedOutcome>${step.expected_outcome}</ExpectedOutcome>
    </Step>`,
      )
      .join('\n');

    // Assemble the final, complete XML report
    return `<SolutionPlan>
  <SummaryOfAnalysis>${report.summary_of_analysis}</SummaryOfAnalysis>
  <SolutionStrategy>${report.solution_strategy}</SolutionStrategy>
  <KeyFiles>
${keyFilesXml}
  </KeyFiles>
  <RelevantCodeLocations>
${locationsXml}
  </RelevantCodeLocations>
  <ImplementationPlan>
${stepsXml}
  </ImplementationPlan>
</SolutionPlan>`;
  }
  protected override async postProcessResult(
    reportJson: string,
  ): Promise<string> {
    const report = JSON.parse(reportJson) as SolutionPlannerOutput;

    if (this.params.include_file_content) {
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
    }
    return this.convertSolutionPlanToXmlString(report);
  }
}

export class SolutionPlannerTool extends BaseDeclarativeTool<
  SolutionPlannerInput,
  ToolResult
> {
  static readonly Name = 'planner';

  constructor(private config: Config) {
    super(
      SolutionPlannerTool.Name,
      'Planner',
      'Delegates complex codebase exploration AND solution planning to an autonomous subagent. Use this for any task that requires understanding the codebase *before* making a change. This agent investigates the file system, analyzes the code, and returns a structured JSON report detailing a complete step-by-step implementation plan for an execution agent to follow. Call this ONCE to get the full plan.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          user_objective: {
            type: 'string',
            description:
              "High-level summary of the user's ultimate goal. This will be the mission for the Solution Planner.",
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
    params: SolutionPlannerInput,
  ): ToolInvocation<SolutionPlannerInput, ToolResult> {
    return new SolutionPlannerInvocation(this.config, params);
  }
}