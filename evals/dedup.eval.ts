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

// Read the workflow file to extract the prompt and settings
const workflowPath = path.join(
  process.cwd(),
  '.github/workflows/gemini-automated-issue-dedup.yml',
);
const workflowContent = await fs.readFile(workflowPath, 'utf8');

const workflowData = yaml.load(workflowContent) as any;
const geminiStep = workflowData.jobs?.['find-duplicates']?.steps?.find(
  (step: any) => step.id === 'gemini_issue_deduplication',
);

const DEDUP_PROMPT_TEMPLATE = geminiStep?.with?.prompt;
const ORIGINAL_SETTINGS = JSON.parse(geminiStep?.with?.settings || '{}');

if (!DEDUP_PROMPT_TEMPLATE) {
  throw new Error('Could not extract prompt from de-duplication workflow.');
}

const mockMcpPath = path.join(process.cwd(), 'evals/mocks/dedup_mcp.ts');

const createPrompt = (issueNumber: number) => {
  // The prompt uses ${{ github.event.issue.number }} but also references ${ISSUE_NUMBER} (env)
  return DEDUP_PROMPT_TEMPLATE.replace(
    /\${{ github\.repository }}/g,
    'google-gemini/gemini-cli',
  ).replace(/\${{ github\.event\.issue\.number }}/g, issueNumber.toString());
};

const DEDUP_SETTINGS = {
  ...ORIGINAL_SETTINGS,
  mcpServers: {
    issue_deduplication: {
      command: 'npx',
      args: ['tsx', mockMcpPath],
    },
  },
};
if (DEDUP_SETTINGS.telemetry) {
  delete DEDUP_SETTINGS.telemetry;
}

describe('dedup_agent', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should identify duplicate issues',
    prompt: ['--output-format', 'json', '--prompt', createPrompt(101)],
    env: {
      ISSUE_NUMBER: '101',
      GITHUB_ENV: 'github_env',
    },
    params: {
      settings: DEDUP_SETTINGS,
    },
    files: {
      github_env: '',
      // Mock gh binary
      'bin/gh': `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args.includes('issue view')) {
    const issueNum = args.match(/view (\\d+)/)?.[1];
    if (issueNum === '101') {
        console.log(JSON.stringify({
            number: 101,
            title: 'CLI crashes on start',
            body: 'It segfaults immediately.',
            comments: []
        }));
    } else if (issueNum === '201') {
        console.log(JSON.stringify({
            number: 201,
            title: 'Segfault on launch',
            body: 'The app crashes right away.',
            comments: []
        }));
    } else if (issueNum === '202') {
        console.log(JSON.stringify({
            number: 202,
            title: 'Unrelated bug',
            body: 'Themes are not working.',
            comments: []
        }));
    }
}
`,
    },
    assert: async (rig: any, result) => {
      // Verify JSON output stats
      const output = JSON.parse(result);
      expect(output.stats).toBeDefined();
      expect(output.stats.tools.byName['duplicates']).toBeDefined();
      expect(output.stats.tools.byName['run_shell_command']).toBeDefined();

      // Verify detailed tool usage via telemetry
      const toolLogs = rig.readToolLogs();
      const duplicatesCall = toolLogs.find(
        (l: any) => l.toolRequest.name === 'duplicates',
      );
      expect(duplicatesCall).toBeDefined();

      // The current prompt uses echo to set GITHUB_ENV
      // We check the tool call for the echo command
      const shellCalls = toolLogs.filter(
        (l: any) => l.toolRequest.name === 'run_shell_command',
      );
      const envCall = shellCalls.find((call: any) =>
        call.toolRequest.args.includes('DUPLICATE_ISSUES_CSV'),
      );

      expect(envCall).toBeDefined();
      // Check the command content
      const match = envCall.toolRequest.args.match(
        /DUPLICATE_ISSUES_CSV=\[?([\d, ]*)\]?/,
      );
      expect(match).not.toBeNull();
      const issues = match![1]
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s);
      expect(issues).toContain('201');
      expect(issues).not.toContain('202');
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should respect "not a duplicate" comments',
    prompt: ['--output-format', 'json', '--prompt', createPrompt(101)],
    env: {
      ISSUE_NUMBER: '101',
      GITHUB_ENV: 'github_env',
    },
    params: {
      settings: DEDUP_SETTINGS,
    },
    files: {
      github_env: '',
      'bin/gh': `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args.includes('issue view')) {
    const issueNum = args.match(/view (\\d+)/)?.[1];
    if (issueNum === '101') {
        console.log(JSON.stringify({
            number: 101,
            title: 'CLI crashes on start',
            body: 'It segfaults immediately.',
            comments: [{ body: 'Note: This is NOT a duplicate of #201, different root cause.' }]
        }));
    } else if (issueNum === '201') {
        console.log(JSON.stringify({
            number: 201,
            title: 'Segfault on launch',
            body: 'The app crashes right away.',
            comments: []
        }));
    } else {
        console.log(JSON.stringify({ number: parseInt(issueNum), title: '', body: '', comments: [] }));
    }
}
`,
    },
    assert: async (rig: any, result) => {
      // Verify JSON output stats
      const output = JSON.parse(result);
      expect(output.stats).toBeDefined();

      const toolLogs = rig.readToolLogs();
      const duplicatesCall = toolLogs.find(
        (l: any) => l.toolRequest.name === 'duplicates',
      );
      expect(duplicatesCall).toBeDefined();

      const shellCalls = toolLogs.filter(
        (l: any) => l.toolRequest.name === 'run_shell_command',
      );
      // It might not call echo if no duplicates are found, or it might echo an empty list.
      // We'll check if it does call echo, that 201 is NOT in it.
      const envCall = shellCalls.find((call: any) =>
        call.toolRequest.args.includes('DUPLICATE_ISSUES_CSV'),
      );

      if (envCall) {
        const match = envCall.toolRequest.args.match(
          /DUPLICATE_ISSUES_CSV=\[?([\d, ]*)\]?/,
        );
        const issues = match
          ? match[1]
              .split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => s)
          : [];
        expect(issues).not.toContain('201');
      }
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should differentiate false positives with high similarity',
    prompt: ['--output-format', 'json', '--prompt', createPrompt(301)],
    env: {
      ISSUE_NUMBER: '301',
      GITHUB_ENV: 'github_env',
    },
    params: {
      settings: DEDUP_SETTINGS,
    },
    files: {
      github_env: '',
      'bin/gh': `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args.includes('issue view')) {
    const issueNum = args.match(/view (\\d+)/)?.[1];
    if (issueNum === '301') {
        console.log(JSON.stringify({
            number: 301,
            title: 'App crashes when I click Save',
            body: 'I click the save button and it crashes.',
            comments: []
        }));
    } else if (issueNum === '302') {
        console.log(JSON.stringify({
            number: 302,
            title: 'App crashes when I click Load',
            body: 'I click the load button and it crashes. This seems related to the loader component.',
            comments: []
        }));
    } else {
        console.log(JSON.stringify({ number: parseInt(issueNum), title: '', body: '', comments: [] }));
    }
}
`,
    },
    assert: async (rig: any, result) => {
      // Verify JSON output stats
      const output = JSON.parse(result);
      expect(output.stats).toBeDefined();

      const toolLogs = rig.readToolLogs();
      const duplicatesCall = toolLogs.find(
        (l: any) => l.toolRequest.name === 'duplicates',
      );
      expect(duplicatesCall).toBeDefined();

      const shellCalls = toolLogs.filter(
        (l: any) => l.toolRequest.name === 'run_shell_command',
      );
      const envCall = shellCalls.find((call: any) =>
        call.toolRequest.args.includes('DUPLICATE_ISSUES_CSV'),
      );

      if (envCall) {
        const match = envCall.toolRequest.args.match(
          /DUPLICATE_ISSUES_CSV=\[?([\d, ]*)\]?/,
        );
        const issues = match
          ? match[1]
              .split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => s)
          : [];
        // Should NOT contain 302 because it's a different feature (Save vs Load) despite crash
        expect(issues).not.toContain('302');
      }
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should reject matches with low similarity',
    prompt: ['--output-format', 'json', '--prompt', createPrompt(401)],
    env: {
      ISSUE_NUMBER: '401',
      GITHUB_ENV: 'github_env',
    },
    params: {
      settings: DEDUP_SETTINGS,
    },
    files: {
      github_env: '',
      'bin/gh': `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args.includes('issue view')) {
    const issueNum = args.match(/view (\\d+)/)?.[1];
    if (issueNum === '401') {
        console.log(JSON.stringify({
            number: 401,
            title: 'Feature request: Dark mode',
            body: 'Please add dark mode.',
            comments: []
        }));
    } else if (issueNum === '402') {
        console.log(JSON.stringify({
            number: 402,
            title: 'Feature request: Light mode',
            body: 'Please add light mode.',
            comments: []
        }));
    } else {
        console.log(JSON.stringify({ number: parseInt(issueNum), title: '', body: '', comments: [] }));
    }
}
`,
    },
    assert: async (rig: any, result) => {
      // Verify JSON output stats
      const output = JSON.parse(result);
      expect(output.stats).toBeDefined();

      const toolLogs = rig.readToolLogs();
      const duplicatesCall = toolLogs.find(
        (l: any) => l.toolRequest.name === 'duplicates',
      );
      expect(duplicatesCall).toBeDefined();

      const shellCalls = toolLogs.filter(
        (l: any) => l.toolRequest.name === 'run_shell_command',
      );
      const envCall = shellCalls.find((call: any) =>
        call.toolRequest.args.includes('DUPLICATE_ISSUES_CSV'),
      );

      if (envCall) {
        const match = envCall.toolRequest.args.match(
          /DUPLICATE_ISSUES_CSV=\[?([\d, ]*)\]?/,
        );
        const issues = match
          ? match[1]
              .split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => s)
          : [];
        expect(issues).not.toContain('402');
        expect(issues.length).toBe(0);
      }
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify multiple duplicates',
    prompt: ['--output-format', 'json', '--prompt', createPrompt(501)],
    env: {
      ISSUE_NUMBER: '501',
      GITHUB_ENV: 'github_env',
    },
    params: {
      settings: DEDUP_SETTINGS,
    },
    files: {
      github_env: '',
      'bin/gh': `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args.includes('issue view')) {
    const issueNum = args.match(/view (\\d+)/)?.[1];
    if (issueNum === '501') {
        console.log(JSON.stringify({
            number: 501,
            title: 'Crash on login',
            body: 'The app crashes when I try to log in.',
            comments: []
        }));
    } else if (issueNum === '502') {
        console.log(JSON.stringify({
            number: 502,
            title: 'Crash on sign in',
            body: 'Crashes during sign in process.',
            comments: []
        }));
    } else if (issueNum === '503') {
        console.log(JSON.stringify({
            number: 503,
            title: 'Crashes on login page',
            body: 'I get a crash immediately on the login page.',
            comments: []
        }));
    } else {
        console.log(JSON.stringify({ number: parseInt(issueNum), title: '', body: '', comments: [] }));
    }
}
`,
    },
    assert: async (rig: any, result) => {
      // Verify JSON output stats
      const output = JSON.parse(result);
      expect(output.stats).toBeDefined();

      const toolLogs = rig.readToolLogs();
      const duplicatesCall = toolLogs.find(
        (l: any) => l.toolRequest.name === 'duplicates',
      );
      expect(duplicatesCall).toBeDefined();

      const shellCalls = toolLogs.filter(
        (l: any) => l.toolRequest.name === 'run_shell_command',
      );
      const envCall = shellCalls.find((call: any) =>
        call.toolRequest.args.includes('DUPLICATE_ISSUES_CSV'),
      );

      expect(envCall).toBeDefined();
      const match = envCall.toolRequest.args.match(
        /DUPLICATE_ISSUES_CSV=\[?([\d, ]*)\]?/,
      );
      const issues = match
        ? match[1]
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s)
        : [];
      expect(issues).toContain('502');
      expect(issues).toContain('503');
    },
  });
});
