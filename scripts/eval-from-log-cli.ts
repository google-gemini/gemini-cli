#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CLI entry point for creating a fail-closed, reviewable eval
 * draft from one Gemini CLI session turn.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  formatTurnForDisplay,
  fromLog,
  inspectLog,
} from './utils/eval-from-log.js';

const HELP_TEXT = `
eval:from-log - Create a reviewable behavioral eval draft from one session turn

Usage:
  npm run eval:from-log -- --log <session.jsonl> --list-turns [options]
  npm run eval:from-log -- --log <session.jsonl> --message-id <id> \\
    --name <name> --expect-tool <tool> --fixture <path> [options]

Required for generation:
  --log <path>              Gemini CLI session .jsonl or legacy .json file
  --name <name>             Human-written eval case name
  --expect-tool <tool>      Tool that should be called (repeatable), or use
  --forbid-tool <tool>      Tool that must not be called (repeatable)
  --fixture <path>          Workspace-relative starting file (repeatable), or use
  --no-fixtures-needed      Confirm that the eval needs no workspace fixtures

Turn selection:
  --list-turns              Inspect eligible turns without generating a draft
  --message-id <id>         Select one user turn; required when several exist

Safety and output:
  --workspace <dir>         Original session workspace (default: current directory)
  --output <path>           Direct child of evals/, for example evals/bug.eval.ts
  --write                   Write the draft; preview is the default
  --suite <name>            suiteName metadata (default: regression)
  --json                    Emit machine-readable output
  --root <dir>              Gemini CLI repository root (default: current directory)
  --help                    Show this help

Values beginning with "--", or the value "-h", must use --option=value,
for example --name="--yolo flag still asks for confirmation".

Session files are normally stored under:
  ~/.gemini/tmp/<project-identifier>/chats/session-*.jsonl

Use "gemini --list-sessions" or /resume (also /chat) to locate a session.

Examples:
  npm run eval:from-log -- --log /path/session.jsonl \\
    --workspace /path/to/original/workspace --list-turns

  npm run eval:from-log -- --log /path/session.jsonl --message-id user-42 \\
    --workspace /path/to/original/workspace \\
    --name "uses read_many_files for related files" \\
    --expect-tool read_many_files --forbid-tool read_file \\
    --fixture src/a.ts --fixture src/b.ts

  npm run eval:from-log -- --log /path/session.jsonl --message-id user-42 \\
    --workspace /path/to/original/workspace \\
    --name "asks before a destructive command" --expect-tool ask_user \\
    --no-fixtures-needed --output evals/asks-before-delete.eval.ts --write

The command never treats observed calls as expected behavior, never reconstructs
files from tool output, and never runs the generated behavioral eval. Every
draft contains a runtime guard that must be removed only after human review and
a fail-before-fix check.
`.trim();

const INSPECTION_WARNING =
  'Secret detection and path redaction are best effort. Do not publish a session log, and review displayed content before sharing it.';

interface CliOptions {
  log?: string;
  listTurns: boolean;
  messageId?: string;
  name?: string;
  suite?: string;
  expectedTools: string[];
  forbiddenTools: string[];
  fixtures: string[];
  noFixturesNeeded: boolean;
  workspace?: string;
  output?: string;
  write: boolean;
  json: boolean;
  root?: string;
  help: boolean;
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (
    value === undefined ||
    value.length === 0 ||
    value === '-h' ||
    value.startsWith('--')
  ) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    listTurns: false,
    expectedTools: [],
    forbiddenTools: [],
    fixtures: [],
    noFixturesNeeded: false,
    write: false,
    json: false,
    help: false,
  };
  const args = argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const rawArg = args[index];
    let arg = rawArg;
    let inlineValue: string | undefined;
    const equalsIndex = rawArg.indexOf('=');
    if (rawArg.startsWith('--') && equalsIndex > 2) {
      arg = rawArg.slice(0, equalsIndex);
      inlineValue = rawArg.slice(equalsIndex + 1);
    }

    const readValue = (): string => {
      if (inlineValue !== undefined) {
        if (inlineValue.length === 0) {
          throw new Error(`${arg} requires a value.`);
        }
        return inlineValue;
      }

      const value = optionValue(args, index, arg);
      index += 1;
      return value;
    };

    const assertFlag = (): void => {
      if (inlineValue !== undefined) {
        throw new Error(`${arg} does not take a value.`);
      }
    };

    switch (arg) {
      case '--help':
      case '-h':
        assertFlag();
        options.help = true;
        break;
      case '--list-turns':
        assertFlag();
        options.listTurns = true;
        break;
      case '--no-fixtures-needed':
        assertFlag();
        options.noFixturesNeeded = true;
        break;
      case '--write':
        assertFlag();
        options.write = true;
        break;
      case '--json':
        assertFlag();
        options.json = true;
        break;
      case '--log':
        options.log = readValue();
        break;
      case '--message-id':
        options.messageId = readValue();
        break;
      case '--name':
        options.name = readValue();
        break;
      case '--suite':
        options.suite = readValue();
        break;
      case '--expect-tool':
        options.expectedTools.push(readValue());
        break;
      case '--forbid-tool':
        options.forbiddenTools.push(readValue());
        break;
      case '--fixture':
        options.fixtures.push(readValue());
        break;
      case '--workspace':
        options.workspace = readValue();
        break;
      case '--output':
        options.output = readValue();
        break;
      case '--root':
        options.root = readValue();
        break;
      default:
        throw new Error(`Unknown argument: ${rawArg}`);
    }
  }

  return options;
}

function isUnsafeUnicodeDisplayCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x061c ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x2028 && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

function isUnsafeTerminalCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f || isUnsafeUnicodeDisplayCodePoint(codePoint);
}

export function escapeForTerminal(value: string): string {
  let escaped = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    escaped +=
      codePoint !== undefined && isUnsafeTerminalCodePoint(codePoint)
        ? `\\u${codePoint.toString(16).padStart(4, '0')}`
        : character;
  }
  return escaped;
}

export function stringifyJsonForOutput(value: unknown): string {
  let escaped = '';
  for (const character of JSON.stringify(value, null, 2)) {
    const codePoint = character.codePointAt(0);
    escaped +=
      codePoint !== undefined && isUnsafeUnicodeDisplayCodePoint(codePoint)
        ? `\\u${codePoint.toString(16).padStart(4, '0')}`
        : character;
  }
  return escaped;
}

function summarizePrompt(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim();
  const summary =
    oneLine.length > 120 ? `${oneLine.slice(0, 119)}...` : oneLine;
  return escapeForTerminal(summary);
}

async function listTurns(
  sessionPath: string,
  options: CliOptions,
  workspaceRoot: string,
) {
  const inspected = await inspectLog(sessionPath);
  const turns = inspected.analysis.turns.map((turn) =>
    formatTurnForDisplay(turn, workspaceRoot),
  );

  if (options.json) {
    console.log(
      stringifyJsonForOutput({
        turns,
        unsupportedTurns: inspected.analysis.unsupportedTurns,
        warnings: [INSPECTION_WARNING],
      }),
    );
    return;
  }

  if (turns.length === 0) {
    console.log('No eligible plain-text user turns found.');
  } else {
    console.log('Eligible session turns:');
    for (const turn of turns) {
      console.log(`\n${escapeForTerminal(turn.messageId)}`);
      console.log(`  Prompt: ${summarizePrompt(turn.prompt)}`);
      console.log(
        `  Observed tools: ${
          turn.observedTools
            .map(
              (tool) =>
                `${escapeForTerminal(tool.name)} (${escapeForTerminal(tool.status)})`,
            )
            .join(', ') || '(none)'
        }`,
      );
      console.log(
        `  Candidate fixture paths: ${turn.candidatePaths.map(escapeForTerminal).join(', ') || '(none)'}`,
      );
    }
  }

  if (inspected.analysis.unsupportedTurns.length > 0) {
    console.log('\nUnsupported turns:');
    for (const turn of inspected.analysis.unsupportedTurns) {
      console.log(
        `  ${escapeForTerminal(turn.messageId)}: ${escapeForTerminal(turn.reason)}`,
      );
    }
  }
  console.log(`\nWarning: ${INSPECTION_WARNING}`);
}

function printHumanResult(
  result: Awaited<ReturnType<typeof fromLog>>,
  repoRoot: string,
) {
  const relativeOutput = path.relative(repoRoot, result.outputPath);
  console.log(
    result.wroteFile
      ? `Draft written to ${escapeForTerminal(relativeOutput)}`
      : `Preview for ${escapeForTerminal(relativeOutput)} (nothing was written)`,
  );
  console.log(
    `Selected turn: ${escapeForTerminal(result.selectedTurn.messageId)}`,
  );
  console.log(`Prompt: ${summarizePrompt(result.selectedTurn.prompt)}`);
  console.log(
    `Observed tools (evidence only): ${
      result.selectedTurn.observedTools
        .map(
          (tool) =>
            `${escapeForTerminal(tool.name)} (${escapeForTerminal(tool.status)})`,
        )
        .join(', ') || '(none)'
    }`,
  );
  console.log(
    `Expected tools: ${result.expectedTools.map(escapeForTerminal).join(', ') || '(none)'}`,
  );
  console.log(
    `Forbidden tools: ${result.forbiddenTools.map(escapeForTerminal).join(', ') || '(none)'}`,
  );
  console.log(
    `Fixtures: ${result.fixturePaths.map(escapeForTerminal).join(', ') || '(explicitly none)'}`,
  );
  console.log('Structural validation: passed');

  console.log('\nWarnings:');
  for (const warning of result.warnings) {
    console.log(`  ${escapeForTerminal(warning)}`);
  }

  if (!result.wroteFile) {
    console.log('\nGenerated draft:\n');
    process.stdout.write(result.skeleton);
    if (!result.skeleton.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  console.log('\nNext steps:');
  console.log('  Review the prompt, fixtures, and intended assertions.');
  console.log('  Prove the eval fails before the behavior fix.');
  console.log('  Remove the runtime guard only after those checks.');
  if (!result.wroteFile) {
    console.log(
      '  Re-run with --output evals/<name>.eval.ts --write to save it.',
    );
  }
}

export async function main(argv = process.argv): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`Error: ${escapeForTerminal((error as Error).message)}`);
    return 1;
  }

  if (options.help) {
    console.log(HELP_TEXT);
    return 0;
  }
  if (!options.log) {
    console.error('Error: --log <session.jsonl> is required.');
    return 1;
  }
  const sessionPath = options.log;

  const repoRoot = path.resolve(options.root ?? process.cwd());
  const workspaceRoot = path.resolve(options.workspace ?? process.cwd());

  try {
    if (options.listTurns) {
      if (
        options.messageId ||
        options.name ||
        options.suite ||
        options.expectedTools.length > 0 ||
        options.forbiddenTools.length > 0 ||
        options.fixtures.length > 0 ||
        options.noFixturesNeeded ||
        options.output ||
        options.write
      ) {
        throw new Error(
          '--list-turns cannot be combined with generation or write options.',
        );
      }
      await listTurns(sessionPath, options, workspaceRoot);
      return 0;
    }

    const result = await fromLog(sessionPath, {
      messageId: options.messageId,
      name: options.name ?? '',
      suiteName: options.suite ?? 'regression',
      expectedTools: options.expectedTools,
      forbiddenTools: options.forbiddenTools,
      fixturePaths: options.fixtures,
      noFixturesNeeded: options.noFixturesNeeded,
      workspaceRoot,
      outputPath: options.output,
      write: options.write,
      repoRoot,
    });
    const realRepoRoot = fs.realpathSync(repoRoot);

    if (options.json) {
      console.log(
        stringifyJsonForOutput({
          ...result,
          outputPath: path.relative(realRepoRoot, result.outputPath),
        }),
      );
    } else {
      printHumanResult(result, realRepoRoot);
    }
    return 0;
  } catch (error) {
    console.error(`Error: ${escapeForTerminal((error as Error).message)}`);
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main();
}
