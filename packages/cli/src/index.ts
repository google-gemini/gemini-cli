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

function parseModelArg(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' || args[i] === '-m') {
      return args[i + 1];
    }
    if (args[i].startsWith('--model=')) {
      return args[i].slice('--model='.length);
    }
  }
  return undefined;
}

export async function run(): Promise<void> {
  process.title = 'zoe';

  const config = new ZoeConfig();
  const providerRegistry = new ProviderRegistry();

  const cliModel = parseModelArg(process.argv.slice(2));
  const targetModel = cliModel || config.getSettings().model || 'placeholder';
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

run().catch((err) => {
  console.error('Fatal error starting Zoe:', err);
  process.exit(1);
});
