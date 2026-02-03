/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

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
      steps?: { id?: string; with?: { prompt?: string } }[];
    };
  };
};

const triageStep = workflowData.jobs?.['triage-issue']?.steps?.find(
  (step) => step.id === 'gemini_issue_analysis',
);

const TRIAGE_PROMPT_TEMPLATE = triageStep?.with?.prompt;

if (!TRIAGE_PROMPT_TEMPLATE) {
  throw new Error(
    'Could not extract prompt from workflow file. Check for `jobs.triage-issue.steps[id=gemini_issue_analysis].with.prompt` in the YAML file.',
  );
}

const createPrompt = (title: string, body: string) => {
  // The placeholders in the YAML are ${{ env.ISSUE_TITLE }} etc.
  // We need to replace them with the actual values for the test.
  return TRIAGE_PROMPT_TEMPLATE.replace('${{ env.ISSUE_TITLE }}', title)
    .replace('${{ env.ISSUE_BODY }}', body)
    .replace(
      '${{ env.AVAILABLE_LABELS }}',
      'area/agent, area/enterprise, area/non-interactive, area/core, area/security, area/platform, area/extensions, area/unknown',
    );
};

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
  return async (_rig: unknown, result: string) => {
    const jsonMatch = result.match(/{[\s\S]*}/);
    if (!jsonMatch || !jsonMatch[0]) {
      throw new Error(
        `Could not find a JSON object in the result: "${escapeHtml(result)}"`,
      );
    }

    let data: { labels_to_set?: string[] };
    try {
      data = JSON.parse(jsonMatch[0]);
    } catch (e) {
      const err = e as Error;
      throw new Error(
        `Failed to parse JSON. Error: ${err.message}. Result: "${escapeHtml(result)}"`,
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
    prompt: createPrompt(
      'CLI failed to install on Windows',
      'I tried running npm install but it failed with an error on Windows 11.',
    ),
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for CI/CD failures',
    prompt: createPrompt(
      'Tests are failing in the CI/CD pipeline',
      'The github action is failing with a 500 error.',
    ),
    assert: assertHasLabel('area/platform'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for quota issues',
    prompt: createPrompt(
      'Resource Exhausted 429',
      'I am getting a 429 error when running the CLI.',
    ),
    assert: assertHasLabel('area/platform'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for local build failures',
    prompt: createPrompt(
      'Local build failing',
      'I cannot build the project locally. npm run build fails.',
    ),
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for sandbox issues',
    prompt: createPrompt(
      'Sandbox connection failed',
      'I cannot connect to the docker sandbox environment.',
    ),
    assert: assertHasLabel('area/platform'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for local test failures',
    prompt: createPrompt(
      'Local tests failing',
      'I am running npm test locally and it fails.',
    ),
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/agent for questions about tools',
    prompt: createPrompt(
      'Bug with web search?',
      'I am trying to use web search but I do not know the syntax. Is it @web or /web?',
    ),
    assert: assertHasLabel('area/agent'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/extensions for feature requests',
    prompt: createPrompt(
      'Please add a python extension',
      'I want to write python scripts as an extension.',
    ),
    assert: assertHasLabel('area/extensions'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/unknown for off-topic spam',
    prompt: createPrompt('Buy cheap rolex', 'Click here for discount.'),
    assert: assertHasLabel('area/unknown'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for crash reports phrased as questions',
    prompt: createPrompt(
      'Why does it segfault?',
      'Why does the CLI segfault immediately when I run it on Ubuntu?',
    ),
    assert: assertHasLabel('area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/agent for feature requests for built-in tools',
    prompt: createPrompt(
      'Can we have a diff tool?',
      'Is it possible to add a built-in tool to show diffs before editing?',
    ),
    assert: assertHasLabel('area/agent'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/enterprise for license questions',
    prompt: createPrompt(
      'License key issue',
      'Where do I enter my enterprise license key? I cannot find the setting.',
    ),
    assert: assertHasLabel('area/enterprise'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/unknown for extremely vague reports',
    prompt: createPrompt(
      'It does not work',
      'I tried to use it and it failed.',
    ),
    assert: assertHasLabel('area/unknown'),
  });
});
