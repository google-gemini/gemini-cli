#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import {
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ACTIONLINT_VERSION = '1.7.7';
const SHELLCHECK_VERSION = '0.11.0';
const YAMLLINT_VERSION = '1.35.1';

const TEMP_DIR =
  process.env.GEMINI_LINT_TEMP_DIR || join(tmpdir(), 'gemini-cli-linters');

function getPlatformArch() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'linux' && arch === 'x64') {
    return {
      actionlint: 'linux_amd64',
      shellcheck: 'linux.x86_64',
    };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return {
      actionlint: 'darwin_amd64',
      shellcheck: 'darwin.x86_64',
    };
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      actionlint: 'darwin_arm64',
      shellcheck: 'darwin.aarch64',
    };
  }
  throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`);
}

const platformArch = getPlatformArch();

const PYTHON_VENV_PATH = join(TEMP_DIR, 'python_venv');

const pythonVenvPythonPath = join(
  PYTHON_VENV_PATH,
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python',
);

const yamllintCheck =
  process.platform === 'win32'
    ? `if exist "${PYTHON_VENV_PATH}\\Scripts\\yamllint.exe" (exit 0) else (exit 1)`
    : `test -x "${PYTHON_VENV_PATH}/bin/yamllint"`;

/**
 * @typedef {{
 *   check: string;
 *   installer: string;
 *   run: string;
 * }}
 */

/**
 * @type {{[linterName: string]: Linter}}
 */
const LINTERS = {
  actionlint: {
    check: 'command -v actionlint',
    installer: `
      mkdir -p "${TEMP_DIR}/actionlint"
      curl -sSLo "${TEMP_DIR}/.actionlint.tgz" "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_${platformArch.actionlint}.tar.gz"
      tar -xzf "${TEMP_DIR}/.actionlint.tgz" -C "${TEMP_DIR}/actionlint"
    `,
    run: `
      actionlint \
        -color \
        -ignore 'SC2002:' \
        -ignore 'SC2016:' \
        -ignore 'SC2129:' \
        -ignore 'label ".+" is unknown'
    `,
  },
  shellcheck: {
    check: 'command -v shellcheck',
    installer: `
      mkdir -p "${TEMP_DIR}/shellcheck"
      curl -sSLo "${TEMP_DIR}/.shellcheck.txz" "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.${platformArch.shellcheck}.tar.xz"
      tar -xf "${TEMP_DIR}/.shellcheck.txz" -C "${TEMP_DIR}/shellcheck" --strip-components=1
    `,
    run: `
      git ls-files | grep -E '^([^.]+|.*\\.(sh|zsh|bash))' | xargs file --mime-type \
        | grep "text/x-shellscript" | awk '{ print substr($1, 1, length($1)-1) }' \
        | xargs shellcheck \
          --check-sourced \
          --enable=all \
          --exclude=SC2002,SC2129,SC2310 \
          --severity=style \
          --format=gcc \
          --color=never | sed -e 's/note:/warning:/g' -e 's/style:/warning:/g'
    `,
  },
  yamllint: {
    check: yamllintCheck,
    installer: `
    python3 -m venv "${PYTHON_VENV_PATH}" && \
    "${pythonVenvPythonPath}" -m pip install --upgrade pip && \
    "${pythonVenvPythonPath}" -m pip install "yamllint==${YAMLLINT_VERSION}" --index-url https://pypi.org/simple
  `,
    run: "git ls-files | grep -E '\\.(yaml|yml)' | xargs yamllint --format github",
  },
};

function runCommand(command, stdio = 'inherit') {
  try {
    const env = { ...process.env };
    const nodeBin = join(process.cwd(), 'node_modules', '.bin');
    env.PATH = `${nodeBin}:${TEMP_DIR}/actionlint:${TEMP_DIR}/shellcheck:${PYTHON_VENV_PATH}/bin:${env.PATH}`;
    execSync(command, { stdio, env });
    return true;
  } catch (_e) {
    return false;
  }
}

export function setupLinters() {
  console.log('Setting up linters...');
  if (!process.env.GEMINI_LINT_TEMP_DIR) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEMP_DIR, { recursive: true });

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
  if (!runCommand(LINTERS.shellcheck.run)) {
    process.exit(1);
  }
}

export function runYamllint() {
  console.log('\nRunning yamllint...');
  if (!runCommand(LINTERS.yamllint.run)) {
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
    'gemini-3.0',
    'gemini-2.5',
    'gemini-2.0',
    'gemini-1.5',
    'gemini-1.0',
  ]);

  /**
   * Gets the added lines from the diff output.
   * Returns a Map where keys are file paths and values are Sets of added line numbers.
   */
  function getAddedLines() {
    const baseRef = process.env.GITHUB_BASE_REF || 'main';
    let diffOutput;

    try {
      execSync(`git fetch origin ${baseRef}`);
      const mergeBase = execSync(`git merge-base HEAD origin/${baseRef}`)
        .toString()
        .trim();
      diffOutput = execSync(`git diff -U0 ${mergeBase}..HEAD`)
        .toString()
        .trim();
    } catch (_error) {
      console.error(`Could not get diff against origin/${baseRef}.`);
      try {
        console.log('Falling back to diff against HEAD~1');
        diffOutput = execSync(`git diff -U0 HEAD~1..HEAD`).toString().trim();
      } catch (_fallbackError) {
        console.error('Could not get diff against HEAD~1 either.');
        process.exit(1);
      }
    }

    // Parse the unified diff output to extract added lines per file
    const addedLinesMap = new Map();
    let currentFile = null;

    for (const line of diffOutput.split('\n')) {
      // Match file header: +++ b/path/to/file
      if (line.startsWith('+++ b/')) {
        currentFile = line.slice(6);
        if (!addedLinesMap.has(currentFile)) {
          addedLinesMap.set(currentFile, new Set());
        }
      }
      // Match hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      else if (line.startsWith('@@') && currentFile) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
          const startLine = parseInt(match[1], 10);
          const lineCount = match[2] ? parseInt(match[2], 10) : 1;
          // Add all lines in this hunk as potentially added
          for (let i = 0; i < lineCount; i++) {
            addedLinesMap.get(currentFile).add(startLine + i);
          }
        }
      }
    }

    return addedLinesMap;
  }

  const addedLinesMap = getAddedLines();
  let violationsFound = false;

  for (const [file, addedLineNumbers] of addedLinesMap) {
    if (!existsSync(file) || lstatSync(file).isDirectory()) {
      continue;
    }
    if (addedLineNumbers.size === 0) {
      continue;
    }

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    // Only check added lines for sensitive keywords
    for (const lineNum of addedLineNumbers) {
      const lineIndex = lineNum - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        continue;
      }
      const line = lines[lineIndex];
      let match;
      // Reset the regex lastIndex for each line
      SENSITIVE_PATTERN.lastIndex = 0;
      while ((match = SENSITIVE_PATTERN.exec(line)) !== null) {
        const keyword = match[0];
        if (!ALLOWED_KEYWORDS.has(keyword)) {
          violationsFound = true;
          const colNum = match.index + 1;
          console.log(
            `::warning file=${file},line=${lineNum},col=${colNum}::Found sensitive keyword "${keyword}". Please make sure this change is appropriate to submit.`,
          );
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
