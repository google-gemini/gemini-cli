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

// Read the workflow file to extract the prompt
const workflowPath = path.join(
  process.cwd(),
  '.github/workflows/gemini-scheduled-issue-triage.yml',
);
const workflowContent = await fs.readFile(workflowPath, 'utf8');

// Use a YAML parser for robustness
const workflowData = yaml.load(workflowContent) as {
  jobs?: {
    'triage-issues'?: {
      steps?: {
        id?: string;
        with?: { prompt?: string; script?: string };
        env?: { AVAILABLE_LABELS?: string };
      }[];
    };
  };
};

const geminiStep = workflowData.jobs?.['triage-issues']?.steps?.find(
  (step) => step.id === 'gemini_issue_analysis',
);

const labelsStep = workflowData.jobs?.['triage-issues']?.steps?.find(
  (step) => step.id === 'get_labels',
);

const BATCH_TRIAGE_PROMPT_TEMPLATE = geminiStep?.with?.prompt;
const ORIGINAL_SETTINGS = JSON.parse(geminiStep?.with?.settings || '{}');
const LABELS_SCRIPT = labelsStep?.with?.script;

if (!BATCH_TRIAGE_PROMPT_TEMPLATE) {
  throw new Error(
    'Could not extract prompt from workflow file. Check for `jobs.triage-issues.steps[id=gemini_issue_analysis].with.prompt` in the YAML file.',
  );
}

// Extract available labels from the script
let availableLabels = '';
if (LABELS_SCRIPT) {
  const match = LABELS_SCRIPT.match(
    /const labelNames = labels.map\(label => label.name\);/,
  );
  // Wait, the script in scheduled triage is different!
  // const labelNames = labels.map(label => label.name);
  // It gets ALL labels.
  // But the prompt expects "${AVAILABLE_LABELS}".
  // In the test, we can just mock a reasonable set of labels.
  availableLabels =
    'area/agent, area/core, area/enterprise, area/extensions, area/non-interactive, area/platform, area/security, area/unknown, kind/bug, kind/feature, kind/question, priority/p0, priority/p1, priority/p2, priority/p3';
}

const createPrompt = () => {
  return BATCH_TRIAGE_PROMPT_TEMPLATE.replace(
    '${AVAILABLE_LABELS}',
    availableLabels,
  );
};

const BATCH_TRIAGE_SETTINGS = {
  ...ORIGINAL_SETTINGS,
};
if (BATCH_TRIAGE_SETTINGS.telemetry) {
  delete BATCH_TRIAGE_SETTINGS.telemetry;
}

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
    return '';
  });
};

const assertHasIssueLabel = (issueNumber: number, expectedLabel: string) => {
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
      // Attempt to find JSON array directly if markdown block is missing
      const firstBracket = responseText.indexOf('[');
      const lastBracket = responseText.lastIndexOf(']');
      if (
        firstBracket !== -1 &&
        lastBracket !== -1 &&
        lastBracket > firstBracket
      ) {
        jsonString = responseText.substring(firstBracket, lastBracket + 1);
      } else {
        throw new Error(
          `Could not find a JSON array in the response: "${escapeHtml(responseText)}"`,
        );
      }
    }

    let data: { issue_number: number; labels_to_add: string[] }[];
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      const err = e as Error;
      throw new Error(
        `Failed to parse JSON. Error: ${err.message}. Response: "${escapeHtml(responseText)}"`,
      );
    }

    const issue = data.find((i) => i.issue_number === issueNumber);
    if (!issue) {
      throw new Error(
        `Issue #${issueNumber} not found in output: ${JSON.stringify(data)}`,
      );
    }

    expect(issue.labels_to_add).toContain(expectedLabel);
  };
};

describe('batch_triage_agent', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should identify area/core for local test failures in batch',
    prompt: ['--output-format', 'json', '--prompt', createPrompt()],
    env: {
      AVAILABLE_LABELS: availableLabels,
      ISSUES_TO_TRIAGE: JSON.stringify([
        {
          number: 101,
          title: 'Local tests failing',
          body: 'I am running npm test locally and it fails with an error.',
        },
      ]),
    },
    params: { settings: BATCH_TRIAGE_SETTINGS },
    assert: assertHasIssueLabel(101, 'area/core'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify area/platform for CI failures in batch',
    prompt: ['--output-format', 'json', '--prompt', createPrompt()],
    env: {
      AVAILABLE_LABELS: availableLabels,
      ISSUES_TO_TRIAGE: JSON.stringify([
        {
          number: 102,
          title: 'CI pipeline failed',
          body: 'The GitHub Action for tests failed on the main branch.',
        },
      ]),
    },
    params: { settings: BATCH_TRIAGE_SETTINGS },
    assert: assertHasIssueLabel(102, 'area/platform'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should handle mixed batch correctly',
    prompt: ['--output-format', 'json', '--prompt', createPrompt()],
    env: {
      AVAILABLE_LABELS: availableLabels,
      ISSUES_TO_TRIAGE: JSON.stringify([
        {
          number: 103,
          title: 'Cannot install on MacOS',
          body: 'Install fails with permission error.',
        },
        {
          number: 104,
          title: 'Click to win',
          body: 'Spam body',
        },
      ]),
    },
    params: { settings: BATCH_TRIAGE_SETTINGS },
    assert: async (rig: any, result) => {
      // Assert issue 103 has area/core
      await assertHasIssueLabel(103, 'area/core')(rig, result);
      // Assert issue 104 has area/unknown
      await assertHasIssueLabel(104, 'area/unknown')(rig, result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should handle issues needing retesting (old version)',
    prompt: ['--output-format', 'json', '--prompt', createPrompt()],
    env: {
      AVAILABLE_LABELS: availableLabels,
      ISSUES_TO_TRIAGE: JSON.stringify([
        {
          number: 105,
          title: 'Crash on version 0.1.0',
          body: 'I am using /about and it says 0.1.0. The app crashes when I run it.',
        },
      ]),
    },
    params: { settings: BATCH_TRIAGE_SETTINGS },
    assert: assertHasIssueLabel(105, 'status/need-retesting'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should handle issues needing more information',
    prompt: ['--output-format', 'json', '--prompt', createPrompt()],
    env: {
      AVAILABLE_LABELS: availableLabels,
      ISSUES_TO_TRIAGE: JSON.stringify([
        {
          number: 106,
          title: 'It does not work',
          body: 'Something is broken.',
        },
      ]),
    },
    params: { settings: BATCH_TRIAGE_SETTINGS },
    assert: assertHasIssueLabel(106, 'status/need-information'),
  });

  evalTest('USUALLY_PASSES', {
    name: 'should handle large batch of diverse issues',
    prompt: ['--output-format', 'json', '--prompt', createPrompt()],
    env: {
      AVAILABLE_LABELS: availableLabels,
      ISSUES_TO_TRIAGE: JSON.stringify([
        { number: 107, title: 'Bug A', body: 'Local test failure' },
        { number: 108, title: 'Bug B', body: 'CI failure' },
        { number: 109, title: 'Bug C', body: 'Security leak' },
        { number: 110, title: 'Bug D', body: 'Spam' },
        { number: 111, title: 'Bug E', body: 'Old version 0.0.1' },
      ]),
    },
    params: { settings: BATCH_TRIAGE_SETTINGS },
    assert: async (rig: any, result) => {
      await assertHasIssueLabel(107, 'area/core')(rig, result);
      await assertHasIssueLabel(108, 'area/platform')(rig, result);
      await assertHasIssueLabel(109, 'area/security')(rig, result);
      await assertHasIssueLabel(110, 'area/unknown')(rig, result);
      await assertHasIssueLabel(111, 'status/need-retesting')(rig, result);
    },
  });
});
