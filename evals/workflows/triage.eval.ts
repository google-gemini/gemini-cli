/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from '../test-helper.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { WORKFLOW_TARGET_MODELS } from './constants.js';

// Read the workflow file to extract the prompt
const workflowPath = path.join(
  process.cwd(),
  '.github/workflows/gemini-automated-issue-triage.yml',
);
const workflowContent = await fs.readFile(workflowPath, 'utf8');

// Use a YAML parser for robustness
const workflowData = yaml.load(workflowContent) as {
  jobs?: {
    'triage-issue'?: {
      steps?: {
        id?: string;
        with?: { prompt?: string; script?: string };
      }[];
    };
  };
};

const triageStep = workflowData.jobs?.['triage-issue']?.steps?.find(
  (step) => step.id === 'gemini_issue_analysis',
);

const labelsStep = workflowData.jobs?.['triage-issue']?.steps?.find(
  (step) => step.id === 'get_labels',
);

const TRIAGE_PROMPT_TEMPLATE = triageStep?.with?.prompt;
const LABELS_SCRIPT = labelsStep?.with?.script;

if (!TRIAGE_PROMPT_TEMPLATE) {
  throw new Error(
    'Could not extract prompt from workflow file. Check for `jobs.triage-issue.steps[id=gemini_issue_analysis].with.prompt` in the YAML file.',
  );
}

// Extract available labels from the script
let availableLabels = '';
if (LABELS_SCRIPT) {
  const match = LABELS_SCRIPT.match(/const allowedLabels = \[([\s\S]+?)\];/);
  if (match && match[1]) {
    // Clean up the extracted string: remove quotes, commas, and whitespace
    availableLabels = match[1]
      .replace(/['"\n\r]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(', ');
  }
}

if (!availableLabels) {
  throw new Error(
    'Could not extract available labels from workflow file. Check for `jobs.triage-issue.steps[id=get_labels].with.script` containing `const allowedLabels = [...]`.',
  );
}

const createPrompt = (title: string, body: string) => {
  // The placeholders in the YAML are ${{ env.ISSUE_TITLE }} etc.
  // We need to replace them with the actual values for the test.
  return TRIAGE_PROMPT_TEMPLATE.replace('${{ env.ISSUE_TITLE }}', title)
    .replace('${{ env.ISSUE_BODY }}', body)
    .replace('${{ env.AVAILABLE_LABELS }}', availableLabels);
};

const TRIAGE_SETTINGS = {};

const escapeHtml = (str: string) => {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
    }
    return ''; // Should not happen
  });
};

const assertHasLabel = (expectedLabel: string) => {
  return async (rig: any, result: string) => {
    // Verify JSON output stats
    const output = JSON.parse(result);
    expect(output.stats).toBeDefined();

    // The model response JSON is in the 'response' field
    const responseText = output.response;
    let jsonString: string;
    const match = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match?.[1]) {
      jsonString = match[1];
    } else {
      const firstBrace = responseText.indexOf('{');
      const lastBrace = responseText.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        throw new Error(
          `Could not find a JSON object in the response: "${escapeHtml(responseText)}"`,
        );
      }
      jsonString = responseText.substring(firstBrace, lastBrace + 1);
    }

    let data: { labels_to_set?: string[] };
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      const err = e as Error;
      throw new Error(
        `Failed to parse JSON. Error: ${err.message}. Response: "${escapeHtml(responseText)}"`,
      );
    }

    expect(data).toHaveProperty('labels_to_set');
    expect(Array.isArray(data.labels_to_set)).toBe(true);
    expect(data.labels_to_set).toContain(expectedLabel);
  };
};

describe('triage_agent', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for windows installation issues',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'CLI failed to install on Windows',
        'I tried running npm install but it failed with an error on Windows 11.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for CI/CD failures',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Tests are failing in the CI/CD pipeline',
        'The github action is failing with a 500 error.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/platform'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for quota issues',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Resource Exhausted 429',
        'I am getting a 429 error when running the CLI.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/platform'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for local build failures',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Local build failing',
        'I cannot build the project locally. npm run build fails.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for sandbox issues',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Sandbox connection failed',
        'I cannot connect to the docker sandbox environment.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/platform'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for local test failures',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Local tests failing',
        'I am running npm test locally and it fails.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/agent for questions about tools',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Bug with web search?',
        'I am trying to use web search but I do not know the syntax. Is it @web or /web?',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/agent'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/extensions for feature requests',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Please add a python extension',
        'I want to write python scripts as an extension.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/extensions'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/unknown for off-topic spam',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt('Buy cheap rolex', 'Click here for discount.'),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/unknown'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for crash reports phrased as questions',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Why does it segfault?',
        'Why does the CLI segfault immediately when I run it on Ubuntu?',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/agent for feature requests for built-in tools',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Can we have a diff tool?',
        'Is it possible to add a built-in tool to show diffs before editing?',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/agent'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/enterprise for license questions',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'License key issue',
        'Where do I enter my enterprise license key? I cannot find the setting.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/enterprise'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/unknown for extremely vague reports',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt('It does not work', 'I tried to use it and it failed.'),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/unknown'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/security for prompt injection reports',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Prompt injection vulnerability',
        'I found a way to make the agent ignore instructions by saying "Ignore all previous instructions".',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/security'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/non-interactive for headless crashes',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Headless mode segfault',
        'When I run with --headless, the CLI crashes immediately.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/non-interactive'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/agent for mixed feedback and tool bugs',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Great tool but web search fails',
        'I love using Gemini CLI, it is amazing! However, the @web tool gives me an error every time I search for "react".',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/agent'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for UI performance issues',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'UI is very slow',
        'The new interface is lagging and unresponsive when I scroll.',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/security for accidental secret leakage',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt(
        'Leaked API key in logs',
        'I accidentally posted my API key in a previous issue comment. Can you delete it?',
      ),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/security'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/unknown for nonsensical input',
    prompt: [
      '--output-format',
      'json',
      '--prompt',
      createPrompt('asdfasdf', 'qwerqwer zxcvbnm'),
    ],
    params: { settings: TRIAGE_SETTINGS },
    targetModels: WORKFLOW_TARGET_MODELS,
    assert: assertHasLabel('area/unknown'),
  });
});
