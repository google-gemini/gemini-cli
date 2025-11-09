/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';

import type { AgentCard } from '@a2a-js/sdk';
import type { TaskStore } from '@a2a-js/sdk/server';
import { DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express'; // Import server components
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type { AgentSettings } from '../types.js';
import { GCSTaskStore, NoOpTaskStore } from '../persistence/gcs.js';
import { CoderAgentExecutor } from '../agent/executor.js';
import { requestStorage } from './requestStorage.js';
import { loadConfig, loadEnvironment, setTargetDir } from '../config/config.js';
import { loadSettings } from '../config/settings.js';
import { loadExtensions } from '../config/extension.js';
import { commandRegistry } from '../commands/command-registry.js';
import { SimpleExtensionLoader } from '@google/gemini-cli-core';
import type { Command, CommandArgument } from '../commands/types.js';

type CommandResponse = {
  name: string;
  description: string;
  arguments: CommandArgument[];
  subCommands: CommandResponse[];
};

const coderAgentCard: AgentCard = {
  name: 'Gemini SDLC Agent',
  description:
    'An agent that generates code based on natural language instructions and streams file outputs.',
  url: 'http://localhost:41242/',
  provider: {
    organization: 'Google',
    url: 'https://google.com',
  },
  protocolVersion: '0.3.0',
  version: '0.0.2', // Incremented version
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  securitySchemes: undefined,
  security: undefined,
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [
    {
      id: 'code_generation',
      name: 'Code Generation',
      description:
        'Generates code snippets or complete files based on user requests, streaming the results.',
      tags: ['code', 'development', 'programming'],
      examples: [
        'Write a python function to calculate fibonacci numbers.',
        'Create an HTML file with a basic button that alerts "Hello!" when clicked.',
      ],
      inputModes: ['text'],
      outputModes: ['text'],
    },
  ],
  supportsAuthenticatedExtendedCard: false,
};

export function updateCoderAgentCardUrl(port: number) {
  coderAgentCard.url = `http://localhost:${port}/`;
}

export async function createApp() {
  try {
    // Load the server configuration once on startup.
    const workspaceRoot = setTargetDir(undefined);
    loadEnvironment();
    const settings = loadSettings(workspaceRoot);
    const extensions = loadExtensions(workspaceRoot);
    const config = await loadConfig(
      settings,
      new SimpleExtensionLoader(extensions),
      'a2a-server',
    );

    // loadEnvironment() is called within getConfig now
    const bucketName = process.env['GCS_BUCKET_NAME'];
    let taskStoreForExecutor: TaskStore;
    let taskStoreForHandler: TaskStore;

    if (bucketName) {
      logger.info(`Using GCSTaskStore with bucket: ${bucketName}`);
      const gcsTaskStore = new GCSTaskStore(bucketName);
      taskStoreForExecutor = gcsTaskStore;
      taskStoreForHandler = new NoOpTaskStore(gcsTaskStore);
    } else {
      logger.info('Using InMemoryTaskStore');
      const inMemoryTaskStore = new InMemoryTaskStore();
      taskStoreForExecutor = inMemoryTaskStore;
      taskStoreForHandler = inMemoryTaskStore;
    }

    const agentExecutor = new CoderAgentExecutor(taskStoreForExecutor);

    const requestHandler = new DefaultRequestHandler(
      coderAgentCard,
      taskStoreForHandler,
      agentExecutor,
    );

    let expressApp = express();
    expressApp.use((req, res, next) => {
      requestStorage.run({ req }, next);
    });

    const appBuilder = new A2AExpressApp(requestHandler);
    expressApp = appBuilder.setupRoutes(expressApp, '');
    expressApp.use(express.json());

    expressApp.post('/tasks', async (req, res) => {
      try {
        const taskId = uuidv4();
        const agentSettings = req.body.agentSettings as
          | AgentSettings
          | undefined;
        const contextId = req.body.contextId || uuidv4();
        const wrapper = await agentExecutor.createTask(
          taskId,
          contextId,
          agentSettings,
        );
        await taskStoreForExecutor.save(wrapper.toSDKTask());
        res.status(201).json(wrapper.id);
      } catch (error) {
        logger.error('[CoreAgent] Error creating task:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unknown error creating task';
        res.status(500).send({ error: errorMessage });
      }
    });

    expressApp.post('/executeCommand', async (req, res) => {
      try {
        const { command, args } = req.body;

        if (typeof command !== 'string') {
          return res.status(400).json({ error: 'Invalid "command" field.' });
        }

        if (args && !Array.isArray(args)) {
          return res
            .status(400)
            .json({ error: '"args" field must be an array.' });
        }

        const commandToExecute = commandRegistry.get(command);

        if (!commandToExecute) {
          return res
            .status(404)
            .json({ error: `Command not found: ${command}` });
        }

        const result = await commandToExecute.execute(config, args ?? []);
        return res.status(200).json(result);
      } catch (e) {
        logger.error('Error executing /executeCommand:', e);
        const errorMessage =
          e instanceof Error ? e.message : 'Unknown error executing command';
        return res.status(500).json({ error: errorMessage });
      }
    });

    expressApp.get('/listCommands', (req, res) => {
      try {
        const transformCommand = (
          command: Command,
          visited: string[],
        ): CommandResponse | undefined => {
          const commandName = command.name;
          if (visited.includes(commandName)) {
            console.warn(
              `Command ${commandName} already inserted in the response, skipping`,
            );
            return undefined;
          }

          return {
            name: command.name,
            description: command.description,
            arguments: command.arguments ?? [],
            subCommands: (command.subCommands ?? [])
              .map((subCommand) =>
                transformCommand(subCommand, visited.concat(commandName)),
              )
              .filter(
                (subCommand): subCommand is CommandResponse => !!subCommand,
              ),
          };
        };

        const commands = commandRegistry
          .getAllCommands()
          .filter((command) => command.topLevel)
          .map((command) => transformCommand(command, []));

        return res.status(200).json({ commands });
      } catch (e) {
        logger.error('Error executing /listCommands:', e);
        const errorMessage =
          e instanceof Error ? e.message : 'Unknown error listing commands';
        return res.status(500).json({ error: errorMessage });
      }
    });

    expressApp.get('/tasks/metadata', async (req, res) => {
      // This endpoint is only meaningful if the task store is in-memory.
      if (!(taskStoreForExecutor instanceof InMemoryTaskStore)) {
        res.status(501).send({
          error:
            'Listing all task metadata is only supported when using InMemoryTaskStore.',
        });
      }
      try {
        const wrappers = agentExecutor.getAllTasks();
        if (wrappers && wrappers.length > 0) {
          const tasksMetadata = await Promise.all(
            wrappers.map((wrapper) => wrapper.task.getMetadata()),
          );
          res.status(200).json(tasksMetadata);
        } else {
          res.status(204).send();
        }
      } catch (error) {
        logger.error('[CoreAgent] Error getting all task metadata:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unknown error getting task metadata';
        res.status(500).send({ error: errorMessage });
      }
    });

    expressApp.get('/tasks/:taskId/metadata', async (req, res) => {
      const taskId = req.params.taskId;
      let wrapper = agentExecutor.getTask(taskId);
      if (!wrapper) {
        const sdkTask = await taskStoreForExecutor.load(taskId);
        if (sdkTask) {
          wrapper = await agentExecutor.reconstruct(sdkTask);
        }
      }
      if (!wrapper) {
        res.status(404).send({ error: 'Task not found' });
        return;
      }
      res.json({ metadata: await wrapper.task.getMetadata() });
    });
    return expressApp;
  } catch (error) {
    logger.error('[CoreAgent] Error during startup:', error);
    process.exit(1);
  }
}

export async function main() {
  try {
    const expressApp = await createApp();
    const port = process.env['CODER_AGENT_PORT'] || 0;

    const server = expressApp.listen(port, () => {
      const address = server.address();
      let actualPort;
      if (process.env['CODER_AGENT_PORT']) {
        actualPort = process.env['CODER_AGENT_PORT'];
      } else if (address && typeof address !== 'string') {
        actualPort = address.port;
      } else {
        throw new Error('[Core Agent] Could not find port number.');
      }
      updateCoderAgentCardUrl(Number(actualPort));
      logger.info(
        `[CoreAgent] Agent Server started on http://localhost:${actualPort}`,
      );
      logger.info(
        `[CoreAgent] Agent Card: http://localhost:${actualPort}/.well-known/agent-card.json`,
      );
      logger.info('[CoreAgent] Press Ctrl+C to stop the server');
    });
  } catch (error) {
    logger.error('[CoreAgent] Error during startup:', error);
    process.exit(1);
  }
}
