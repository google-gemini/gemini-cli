/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

// Read the workflow file to extract the prompt
const workflowPath = path.join(
  process.cwd(),
  '.github/workflows/gemini-automated-issue-triage.yml',
);
const workflowContent = fs.readFileSync(workflowPath, 'utf8');

// Extract the prompt block
// Looking for "prompt: |-" followed by the content, until the next step definition
const promptMatch = workflowContent.match(
  /prompt: \|-\n([\s\S]+?)(?=\n\s+-\s+name:)/,
);

if (!promptMatch) {
  throw new Error(
    'Could not extract prompt from workflow file. Check regex or file content.',
  );
}

const rawPrompt = promptMatch[1];
// Remove the YAML indentation (12 spaces based on the file structure)
// We detect the indentation from the first line
const lines = rawPrompt.split('\n');
const firstLineIndent = lines[0].match(/^\s*/)?.[0].length || 0;
const TRIAGE_PROMPT_TEMPLATE = lines
  .map((line) => line.slice(firstLineIndent))
  .join('\n');

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

describe('triage_agent', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for windows installation issues',
    prompt: createPrompt(
      'CLI failed to install on Windows',
      'I tried running npm install but it failed with an error on Windows 11.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/core');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for CI/CD failures',
    prompt: createPrompt(
      'Tests are failing in the CI/CD pipeline',
      'The github action is failing with a 500 error.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/platform');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for quota issues',
    prompt: createPrompt(
      'Resource Exhausted 429',
      'I am getting a 429 error when running the CLI.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/platform');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for local build failures',
    prompt: createPrompt(
      'Local build failing',
      'I cannot build the project locally. npm run build fails.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/core');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for sandbox issues',
    prompt: createPrompt(
      'Sandbox connection failed',
      'I cannot connect to the docker sandbox environment.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/platform');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for local test failures',
    prompt: createPrompt(
      'Local tests failing',
      'I am running npm test locally and it fails.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/core');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/agent for questions about tools',
    prompt: createPrompt(
      'Bug with web search?',
      'I am trying to use web search but I do not know the syntax. Is it @web or /web?',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/agent');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/extensions for feature requests',
    prompt: createPrompt(
      'Please add a python extension',
      'I want to write python scripts as an extension.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/extensions');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/unknown for off-topic spam',
    prompt: createPrompt('Buy cheap rolex', 'Click here for discount.'),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/unknown');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for crash reports phrased as questions',
    prompt: createPrompt(
      'Why does it segfault?',
      'Why does the CLI segfault immediately when I run it on Ubuntu?',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/core');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/agent for feature requests for built-in tools',
    prompt: createPrompt(
      'Can we have a diff tool?',
      'Is it possible to add a built-in tool to show diffs before editing?',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/agent');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/enterprise for license questions',
    prompt: createPrompt(
      'License key issue',
      'Where do I enter my enterprise license key? I cannot find the setting.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/enterprise');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/unknown for extremely vague reports',
    prompt: createPrompt(
      'It does not work',
      'I tried to use it and it failed.',
    ),
    assert: async (rig, result) => {
      const json = JSON.parse(result.match(/{[\s\S]*}/)?.[0] || '{}');
      expect(json.labels_to_set).toContain('area/unknown');
    },
  });
});
