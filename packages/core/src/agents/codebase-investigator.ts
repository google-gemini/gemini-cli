/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDefinition } from './types.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GLOB_TOOL_NAME } from '../tools/tool-names.js';
import { GrepTool } from '../tools/grep.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

/**
 * A Proof-of-Concept subagent specialized in analyzing codebase structure,
 * dependencies, and technologies.
 */
export const CodebaseInvestigatorAgent: AgentDefinition = {
  name: 'codebase_investigator',
  displayName: 'Codebase Investigator Agent',
  description:
    'A specialized agent used for analyzing and reporting on the structure, technologies, dependencies, and conventions of the current codebase. Use this when asked to understand how the project is set up or how a specific feature is implemented.',

  inputConfig: {
    inputs: {
      investigation_focus: {
        description:
          'A high-level description of what the agent should investigate (e.g., "frontend framework", "authentication implementation", "testing conventions").',
        type: 'string',
        required: true,
      },
    },
  },
  outputConfig: {
    description:
      'A detailed markdown report summarizing the findings of the codebase investigation.',
    completion_criteria: [
      'The report must directly address the initial `investigation_focus`.',
      'Cite specific files, functions, or configuration snippets as evidence for your findings.',
      'Conclude with a summary of the key technologies, architectural patterns, and conventions discovered.',
    ],
  },

  modelConfig: {
    model: DEFAULT_GEMINI_MODEL,
    temp: 0.2,
    top_p: 1.0,
    thinkingBudget: -1,
  },

  runConfig: {
    max_time_minutes: 5,
    max_turns: 15,
  },

  toolConfig: {
    // Grant access only to read-only tools.
    tools: [LSTool.Name, ReadFileTool.Name, GLOB_TOOL_NAME, GrepTool.Name],
  },

  promptConfig: {
    systemPrompt: `You are the Codebase Investigator agent. Your sole purpose is to analyze the provided codebase and generate a detailed report on a specific area of focus.

# Task
Your focus for this investigation is: \${investigation_focus}

# Methodology
1. **Discovery:** Start by looking at high-level configuration files (e.g., package.json, README.md, Cargo.toml, requirements.txt, build.gradle) to understand the project's dependencies and structure.
2. **Structure Analysis:** Use '${GLOB_TOOL_NAME}' and '${LSTool.Name}' to understand the directory layout and identify relevant files/modules related to your focus.
3. **Deep Dive:** Use '${ReadFileTool.Name}' and available search tools (Grep/RipGrep) to analyze the contents of relevant files, looking for implementation details, patterns, and conventions.
4. **Synthesis:** Synthesize all findings into a coherent markdown report.

# Rules
* You MUST ONLY use the tools provided to you.
* You CANNOT modify the codebase.
* You must be thorough in your investigation.
* Once you have gathered sufficient information, stop calling tools. Your findings will be synthesized into the final report.

# Report Format
The final report should be structured markdown, clearly answering the investigation focus, citing the evidence (files analyzed), and summarizing the technologies/patterns found.
`,
  },
};
