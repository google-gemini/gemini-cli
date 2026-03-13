#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LINTERS = {
  actionlint: {
    check: 'npm list @tktco/node-actionlint --depth=0',
    installer: 'npm install --save-dev @tktco/node-actionlint',
    run: `
      npx node-actionlint \
        -color \
        -ignore 'SC2002:' \
        -ignore 'SC2016:' \
        -ignore 'SC2129:' \
        -ignore 'label ".+" is unknown'
    `,
  },
  shellcheck: {
    check: 'npm list shellcheck --depth=0',
    installer: 'npm install --save-dev shellcheck',
  },
  yamllint: {
    check: 'npm list yaml-lint --depth=0',
    installer: 'npm install --save-dev yaml-lint',
  },
};

function getShellScripts() {
  const allFiles = execSync('git ls-files', { encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean);

  return allFiles.filter((file) => {
    if (
      file.endsWith('.sh') ||
      file.endsWith('.zsh') ||
      file.endsWith('.bash')
    ) {
      return true;
    }
    if (
      !file.includes('.') &&
      existsSync(file) &&
      !lstatSync(file).isDirectory()
    ) {
      try {
        const content = readFileSync(file, 'utf-8');
        const firstLine = content.split('\n')[0];
        return (
          firstLine.startsWith('#!') &&
          (firstLine.includes('sh') ||
            firstLine.includes('bash') ||
            firstLine.includes('zsh'))
        );
      } catch (_e) {
        return false;
      }
    }
    return false;
  });
}

function getYamlFiles() {
  return execSync('git ls-files', { encoding: 'utf-8' })
    .split('\n')
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'));
}

function runCommand(command, stdio = 'inherit') {
  try {
    execSync(command, { stdio, env: process.env, shell: true });
    return true;
  } catch (_e) {
    return false;
  }
}

export function setupLinters() {
  console.log('Setting up linters...');

  for (const linter in LINTERS) {
    const { check, installer } = LINTERS[linter];
    if (!runCommand(check, 'ignore')) {
      console.log(`Installing ${linter}...`);
      if (!runCommand(installer)) {
        console.error(
          `Failed to install ${linter}. Please install it manually.`,
        );
        process.exit(1);
      }
    }
  }
  console.log('All required linters are available.');
}

export function runESLint() {
  console.log('\nRunning ESLint...');
  if (!runCommand('npm run lint')) {
    process.exit(1);
  }
}

export function runActionlint() {
  console.log('\nRunning actionlint...');
  if (!runCommand(LINTERS.actionlint.run)) {
    process.exit(1);
  }
}

export function runShellcheck() {
  console.log('\nRunning shellcheck...');
  const files = getShellScripts();
  if (files.length === 0) {
    console.log('No shell scripts found.');
    return;
  }

  const args = [
    'shellcheck',
    '--check-sourced',
    '--enable=all',
    '--exclude=SC2002,SC2129,SC2310',
    '--severity=style',
    '--format=gcc',
    '--color=never',
    ...files,
  ];

  const result = spawnSync('npx', args, {
    env: process.env,
    encoding: 'utf-8',
    shell: true, // Needed for npx on Windows and some Unix environments
  });

  if (result.stdout) {
    console.log(
      result.stdout
        .replace(/note:/g, 'warning:')
        .replace(/style:/g, 'warning:'),
    );
  }

  if (result.status !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    process.exit(1);
  }
}

export function runYamllint() {
  console.log('\nRunning yamllint...');
  const files = getYamlFiles();
  if (files.length === 0) {
    console.log('No YAML files found.');
    return;
  }

  const result = spawnSync('npx', ['yaml-lint', ...files], {
    env: process.env,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(1);
  }
}

export function runPrettier() {
  console.log('\nRunning Prettier...');
  if (!runCommand('prettier --check .')) {
    console.log(
      'Prettier check failed. Please run "npm run format" to fix formatting issues.',
    );
    process.exit(1);
  }
}

export function runSensitiveKeywordLinter() {
  console.log('\nRunning sensitive keyword linter...');
  const SENSITIVE_PATTERN = /gemini-\d+(\.\d+)?/g;
  const ALLOWED_KEYWORDS = new Set([
    'gemini-3.1',
    'gemini-3',
    'gemini-3.0',
    'gemini-2.5',
    'gemini-2.0',
    'gemini-1.5',
    'gemini-1.0',
  ]);

  function getChangedFiles() {
    const baseRef = process.env.GITHUB_BASE_REF || 'main';
    try {
      // In CI, we often have the remote main already fetched or can diff against it directly
      // Try to find merge base if possible
      const mergeBase = execSync(
        `git merge-base HEAD origin/${baseRef} 2>/dev/null || git merge-base HEAD ${baseRef} 2>/dev/null`,
      )
        .toString()
        .trim();

      if (mergeBase) {
        return execSync(`git diff --name-only ${mergeBase}..HEAD`)
          .toString()
          .trim()
          .split('\n')
          .filter(Boolean);
      }
    } catch (_error) {
      // Fall through to other methods
    }

    try {
      console.log('Falling back to diff against HEAD~1');
      return execSync(`git diff --name-only HEAD~1..HEAD`)
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch (_fallbackError) {
      console.log('Falling back to all tracked files (slowest)');
      try {
        return execSync('git ls-files')
          .toString()
          .trim()
          .split('\n')
          .filter(Boolean);
      } catch (_ultimateError) {
        console.error('Could not get any files to lint.');
        return [];
      }
    }
  }

  const changedFiles = getChangedFiles();
  let violationsFound = false;

  for (const file of changedFiles) {
    if (!existsSync(file) || lstatSync(file).isDirectory()) {
      continue;
    }
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    let match;
    while ((match = SENSITIVE_PATTERN.exec(content)) !== null) {
      const keyword = match[0];
      if (!ALLOWED_KEYWORDS.has(keyword)) {
        violationsFound = true;
        const matchIndex = match.index;
        let lineNum = 0;
        let charCount = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (charCount + line.length + 1 > matchIndex) {
            lineNum = i + 1;
            const colNum = matchIndex - charCount + 1;
            console.log(
              `::warning file=${file},line=${lineNum},col=${colNum}::Found sensitive keyword "${keyword}". Please make sure this change is appropriate to submit.`,
            );
            break;
          }
          charCount += line.length + 1; // +1 for the newline
        }
      }
    }
  }

  if (!violationsFound) {
    console.log('No sensitive keyword violations found.');
  }
}

function stripJSONComments(json) {
  return json.replace(
    /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
    (m, g) => (g ? '' : m),
  );
}

export function runTSConfigLinter() {
  console.log('\nRunning tsconfig linter...');

  let files = [];
  try {
    // Find all tsconfig.json files under packages/ using a git pathspec
    files = execSync("git ls-files 'packages/**/tsconfig.json'")
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (e) {
    console.error('Error finding tsconfig.json files:', e.message);
    process.exit(1);
  }

  let hasError = false;

  for (const file of files) {
    const tsconfigPath = join(process.cwd(), file);
    if (!existsSync(tsconfigPath)) {
      console.error(`Error: ${tsconfigPath} does not exist.`);
      hasError = true;
      continue;
    }

    try {
      const content = readFileSync(tsconfigPath, 'utf-8');
      const config = JSON.parse(stripJSONComments(content));

      // Check if exclude exists and matches exactly
      if (config.exclude) {
        if (!Array.isArray(config.exclude)) {
          console.error(
            `Error: ${file} "exclude" must be an array. Found: ${JSON.stringify(
              config.exclude,
            )}`,
          );
          hasError = true;
        } else {
          const allowedExclude = new Set(['node_modules', 'dist']);
          const invalidExcludes = config.exclude.filter(
            (item) => !allowedExclude.has(item),
          );

          if (invalidExcludes.length > 0) {
            console.error(
              `Error: ${file} "exclude" contains invalid items: ${JSON.stringify(
                invalidExcludes,
              )}. Only "node_modules" and "dist" are allowed.`,
            );
            hasError = true;
          }
        }
      }
    } catch (error) {
      console.error(`Error parsing ${tsconfigPath}: ${error.message}`);
      hasError = true;
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--setup')) {
    setupLinters();
  }
  if (args.includes('--eslint')) {
    runESLint();
  }
  if (args.includes('--actionlint')) {
    runActionlint();
  }
  if (args.includes('--shellcheck')) {
    runShellcheck();
  }
  if (args.includes('--yamllint')) {
    runYamllint();
  }
  if (args.includes('--prettier')) {
    runPrettier();
  }
  if (args.includes('--sensitive-keywords')) {
    runSensitiveKeywordLinter();
  }
  if (args.includes('--tsconfig')) {
    runTSConfigLinter();
  }

  if (args.length === 0) {
    setupLinters();
    runESLint();
    runActionlint();
    runShellcheck();
    runYamllint();
    runPrettier();
    runSensitiveKeywordLinter();
    runTSConfigLinter();
    console.log('\nAll linting checks passed!');
  }
}

main();
