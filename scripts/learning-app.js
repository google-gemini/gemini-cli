#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

const topics = [
  {
    title: 'Execution and deployment',
    summary:
      'The deployment guide explains several ways to run the CLI, including standard NPM installation, Docker container usage, and running directly from source.',
  },
  {
    title: 'Architecture',
    summary:
      'Gemini CLI is composed of a user-facing CLI package and a backend core package. The CLI manages user input and output while the core handles API requests and tool execution.',
  },
  {
    title: 'Using the CLI',
    summary:
      'Documentation covers authentication, commands, configuration options, and how to manage conversation history and extensions.',
  },
  {
    title: 'Core details',
    summary:
      'The core package exposes tool APIs and manages memory using GEMINI.md files with automatic chat history compression.',
  },
  {
    title: 'Extensions',
    summary:
      'Extensions are directories with gemini-extension.json files that can add servers, context files, or extra tools to the CLI.',
  },
  {
    title: 'Checkpointing',
    summary:
      'Before running a tool that modifies files, the CLI saves a git snapshot and conversation history so that changes can be rolled back with the /restore command.',
  },
  {
    title: 'Telemetry',
    summary:
      'Telemetry uses OpenTelemetry to emit traces and metrics. It can be enabled with CLI flags, environment variables, or settings.json.',
  },
  {
    title: 'Sandboxing',
    summary:
      'Sandboxing isolates risky commands in containers or via sandbox-exec on macOS to protect the host system.',
  },
  {
    title: 'Built-in tools',
    summary:
      'Tools allow Gemini to read files, run shell commands, fetch URLs, and modify files. They are managed by the core package.',
  },
  {
    title: 'Quotas and pricing',
    summary:
      'Quotas and costs depend on the authentication method. Free tier has limited requests per minute while API key and enterprise accounts are billed based on usage.',
  },
];

const rl = readline.createInterface({ input, output });

function showMenu() {
  console.log('\nGemini CLI Learning App');
  topics.forEach((t, idx) => {
    console.log(`${idx + 1}. ${t.title}`);
  });
  console.log('q. Quit');
}

function prompt() {
  rl.question('\nSelect a topic (1-10) or q to quit: ', (answer) => {
    if (answer.toLowerCase() === 'q') {
      rl.close();
      return;
    }
    const index = Number.parseInt(answer, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= topics.length) {
      console.log(`\n${topics[index - 1].title}\n${topics[index - 1].summary}`);
    } else {
      console.log('Invalid choice.');
    }
    prompt();
  });
}

showMenu();
prompt();
