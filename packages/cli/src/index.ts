#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { SessionEngine, ZoeConfig, ProviderRegistry } from '@zoe/core';
import { CommandRegistry } from './commands/CommandRegistry.js';
import { MainScreen } from './ui/screens/MainScreen.js';

export const VERSION = '0.1.0';

export function getVersionText(): string {
  return `zoe v${VERSION}`;
}

export function getHelpText(): string {
  return `
Zoe — Socratic terminal coding mentor.

Usage:
  zoe [options]

Options:
  -v, --version         Show Zoe version
  -h, --help            Show this help message
  -m, --model <name>    Run with a specific model (e.g. agy, codex, claude, llama3.2)

Interactive Slash Commands:
  /help                 Show all available slash commands
  /model [name]         Inspect or switch active model
  /thoughts [on|off]    Inspect or toggle model thought process visibility
  /policy [name]        Inspect or set mentor policy
  /learn <topic>        Socratic conceptual deep-dive
  /solve <problem>      Guided problem solving
  /debug <issue>        Root cause analysis & debugging guidance
  /review [target]      Socratic code review
  /ponytail [target]    Minimalist code philosophy & removal advice
  /simplify [target]    Simplify code & eliminate dependencies
  /archify [target]     Generate ASCII system architecture diagram
  /diagram <flow>       Generate ASCII flow pipeline diagram
  /knowledge [query]    Inspect developer concept knowledge graph
  /progress             View concept mastery statistics
  /mastered <concept>   Mark a concept as mastered
  /practice <concept>   Get Socratic practice on a concept
  /challenge [topic]    Knowledge-driven engineering dilemma
  /quiz [topic]         Quick engineering concept check
  /symbols [query]      List codebase symbols
  /find <query>         Inspect symbol definitions and signatures
  /clear                Clear terminal screen history
  /exit                 Exit Zoe
`.trim();
}

export interface CliFlags {
  version: boolean;
  help: boolean;
  model?: string;
}

export function parseCliFlags(args: string[]): CliFlags {
  let version = false;
  let help = false;
  let model: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--version' || arg === '-v') {
      version = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--model' || arg === '-m') {
      model = args[i + 1];
      i++;
    } else if (arg?.startsWith('--model=')) {
      model = arg.slice('--model='.length);
    }
  }

  return { version, help, model };
}

export async function run(args: string[] = process.argv.slice(2)): Promise<void> {
  const flags = parseCliFlags(args);

  if (flags.version) {
    console.log(getVersionText());
    return;
  }

  if (flags.help) {
    console.log(getHelpText());
    return;
  }

  process.title = 'zoe';

  const config = new ZoeConfig();
  const providerRegistry = new ProviderRegistry();

  const targetModel = flags.model || config.getSettings().model || 'gemini-3.8-flash-high';
  const resolved = providerRegistry.resolve(targetModel);

  const session = new SessionEngine({
    provider: resolved.provider,
    model: resolved.model,
  });
  const commands = new CommandRegistry(providerRegistry);

  session.start();

  const { waitUntilExit } = render(
    React.createElement(MainScreen, { session, commands })
  );

  const cleanup = () => {
    session.end('signal_interrupt');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await waitUntilExit();
}

// Only auto-run if directly executed
if (process.argv[1]?.endsWith('dist/index.js') || process.argv[1]?.endsWith('bin/zoe')) {
  run().catch((err) => {
    console.error('Fatal error starting Zoe:', err);
    process.exit(1);
  });
}
