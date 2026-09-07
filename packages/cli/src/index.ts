#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
      model = args[i + 1]?.trim();
      if (!model || model.startsWith('-')) throw new Error(`${arg} requires a model name.`);
      i++;
    } else if (arg?.startsWith('--model=')) {
      model = arg.slice('--model='.length).trim();
      if (!model) throw new Error('--model requires a model name.');
    } else {
      throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
    }
  }

  return { version, help, model };
}

export async function runPipedSession(
  session: SessionEngine,
  commands: CommandRegistry,
  input: Readable,
  write: (text: string) => void,
): Promise<void> {
  const lines = createInterface({ input, terminal: false });
  let exited = false;
  const onMessage = (message: { content: string }) => write(`${message.content}\n`);
  session.events.on('runtime:message', onMessage);
  try {
    for await (const line of lines) {
      const value = line.trim();
      if (!value) continue;
      if (commands.isCommand(value)) {
        const result = await commands.execute(value, { session, exit: () => { exited = true; } });
        if (result) session.addSystemMessage(result);
      } else {
        await session.send(value);
      }
      if (exited) break;
    }
  } finally {
    lines.close();
    session.events.off('runtime:message', onMessage);
    session.end(exited ? 'user_exit' : 'input_end');
  }
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

  session.setShowThoughts(config.getSettings().showThoughts ?? true);
  session.start();

  if (!process.stdin.isTTY) {
    await runPipedSession(session, commands, process.stdin, (text) => process.stdout.write(text));
    return;
  }

  const { waitUntilExit } = render(
    React.createElement(MainScreen, { session, commands })
  );

  const cleanup = () => {
    session.end('signal_interrupt');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    await waitUntilExit();
  } finally {
    process.off('SIGINT', cleanup);
    process.off('SIGTERM', cleanup);
  }
}

// Only auto-run if directly executed
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}
