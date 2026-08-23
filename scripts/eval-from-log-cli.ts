#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CLI entry point for the eval:from-log command.
 *
 * Reads a session JSONL file produced by Gemini CLI and generates a sanitized,
 * validated TypeScript eval skeleton that can be reviewed and submitted as a
 * regression test.
 *
 * Usage:
 *   npm run eval:from-log -- <session.jsonl> [options]
 *
 * Options:
 *   --name <name>      Eval case name (default: derived from first prompt)
 *   --suite <name>     Suite name (default: 'regression')
 *   --output <dir>     Output directory (default: evals/)
 *   --stdout           Print skeleton to stdout, do not write file
 *   --no-validate      Skip running eval:validate on the output
 *   --json             Print result summary as JSON
 *   --root <dir>       Repository root (default: current directory)
 *   --help             Show this help message
 *
 * Finding your session file:
 *   Gemini CLI saves session JSONL files to:
 *     ~/.gemini/<project-hash>/chats/session-<timestamp>-<id>.jsonl
 *
 *   You can list recent sessions by running:
 *     ls ~/.gemini/<project-hash>/chats/session-*.jsonl
 *
 *   Or from within Gemini CLI, use /history to view past sessions.
 */

import path from 'node:path';
import { fromLog } from './utils/eval-from-log.js';

const HELP_TEXT = `
eval:from-log — Generate an eval skeleton from a Gemini CLI session log

Usage:
  npm run eval:from-log -- <session.jsonl> [options]

Arguments:
  <session.jsonl>     Path to a Gemini CLI session JSONL file (required)

Options:
  --name <name>       Eval case name (default: derived from first user prompt)
  --suite <name>      suiteName field in the generated eval (default: 'regression')
  --output <dir>      Directory to write the generated .eval.ts file
                      (default: evals/)
  --stdout            Print the skeleton to stdout instead of writing a file
  --no-validate       Skip running eval:validate on the output file
  --json              Print a JSON summary of the result instead of human output
  --root <dir>        Repository root for resolving defaults (default: cwd)
  --help              Show this help message

Finding your session file:
  Gemini CLI stores session logs at:
    ~/.gemini/<project-hash>/chats/session-<timestamp>-<id>.jsonl

  To list recent sessions:
    ls ~/.gemini/*/chats/session-*.jsonl   (macOS / Linux)
    dir %USERPROFILE%\\.gemini\\*\\chats\\     (Windows)

  Or from within Gemini CLI, use the /history command.

Examples:
  # Generate an eval from a session log (writes to evals/)
  npm run eval:from-log -- ~/.gemini/abc123/chats/session-2026-08-23T10-00-a1b2c3d4.jsonl

  # Provide a custom name and preview without writing
  npm run eval:from-log -- session.jsonl --name "should not delete files when asked to clean up" --stdout

  # Write to a custom directory and output result as JSON
  npm run eval:from-log -- session.jsonl --output ./evals --json
`.trim();

function parseArgs(argv: string[]): {
  sessionPath: string | undefined;
  name: string | undefined;
  suite: string | undefined;
  outputDir: string | undefined;
  stdout: boolean;
  noValidate: boolean;
  json: boolean;
  root: string | undefined;
  help: boolean;
} {
  const args = argv.slice(2);
  let sessionPath: string | undefined;
  let name: string | undefined;
  let suite: string | undefined;
  let outputDir: string | undefined;
  let stdout = false;
  let noValidate = false;
  let json = false;
  let root: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--stdout':
        stdout = true;
        break;
      case '--no-validate':
        noValidate = true;
        break;
      case '--json':
        json = true;
        break;
      case '--name':
        name = args[++i];
        break;
      case '--suite':
        suite = args[++i];
        break;
      case '--output':
        outputDir = args[++i];
        break;
      case '--root':
        root = args[++i];
        break;
      default:
        if (!arg.startsWith('--') && sessionPath === undefined) {
          sessionPath = arg;
        } else {
          console.error(`Unknown argument: ${arg}`);
          process.exit(1);
        }
    }
  }

  return {
    sessionPath,
    name,
    suite,
    outputDir,
    stdout,
    noValidate,
    json,
    root,
    help,
  };
}

async function main() {
  const {
    sessionPath,
    name,
    suite,
    outputDir,
    stdout: stdoutMode,
    noValidate,
    json: jsonMode,
    root,
    help,
  } = parseArgs(process.argv);

  if (help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (!sessionPath) {
    console.error('Error: <session.jsonl> path is required.\n');
    console.error('Usage: npm run eval:from-log -- <session.jsonl> [options]');
    console.error('       npm run eval:from-log -- --help');
    process.exit(1);
  }

  const repoRoot = root ? path.resolve(root) : process.cwd();

  try {
    const result = await fromLog(sessionPath, {
      name,
      suiteName: suite,
      outputDir: outputDir ? path.resolve(outputDir) : undefined,
      stdoutMode,
      validate: !noValidate,
      repoRoot,
    });

    if (stdoutMode) {
      // In stdout mode: print the skeleton, warnings to stderr
      process.stdout.write(result.skeleton);
      for (const w of result.warnings) {
        console.error(`⚠ ${w}`);
      }
      process.exit(result.validationPassed ? 0 : 1);
    }

    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            outputPath: result.outputPath,
            prompt: result.prompt,
            fileCount: result.fileCount,
            observedTools: result.observedTools,
            validationPassed: result.validationPassed,
            warnings: result.warnings,
          },
          null,
          2,
        ),
      );
      process.exit(result.validationPassed ? 0 : 1);
    }

    // Human-readable output
    console.log('');
    console.log('✓ Eval skeleton generated');
    console.log(`  Output:  ${result.outputPath}`);
    console.log(
      `  Prompt:  ${result.prompt.slice(0, 80)}${result.prompt.length > 80 ? '…' : ''}`,
    );
    console.log(`  Files:   ${result.fileCount} workspace file(s) included`);
    console.log(
      `  Tools:   ${result.observedTools.join(', ') || '(none observed)'}`,
    );

    if (result.warnings.length > 0) {
      console.log('');
      console.log('Warnings:');
      for (const w of result.warnings) {
        console.log(`  ⚠ ${w}`);
      }
    }

    if (result.validationPassed) {
      console.log('');
      console.log('✓ eval:validate passed');
    } else {
      console.log('');
      console.log('✗ eval:validate found issues — see warnings above.');
      console.log('  Fix them before submitting the eval as a PR.');
    }

    console.log('');
    console.log('Next steps:');
    console.log(`  1. Review the generated file: ${result.outputPath}`);
    console.log(
      '  2. Refine the assertions to precisely capture the expected behavior.',
    );
    console.log('  3. Run: npm run build && npm run bundle');
    console.log(
      `  4. Test: npx vitest run --config evals/vitest.config.ts ${result.outputPath}`,
    );
    console.log('  5. Submit a PR with the new eval file.');
    console.log('');

    process.exit(result.validationPassed ? 0 : 1);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Fatal error:', error);
    }
    process.exit(1);
  }
}

main();
