#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { SessionEngine, ZoeConfig } from '@zoe/core';
import { CommandRegistry } from './commands/CommandRegistry.js';
import { MainScreen } from './ui/screens/MainScreen.js';

export async function run(): Promise<void> {
  process.title = 'zoe';

  const config = new ZoeConfig();
  const session = new SessionEngine();
  const commands = new CommandRegistry();

  session.start();

  const { waitUntilExit } = render(
    React.createElement(MainScreen, { session, commands })
  );

  // Handle termination signals
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
