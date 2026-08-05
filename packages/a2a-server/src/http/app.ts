/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { timingSafeEqual } from 'node:crypto';
import express, { type Request } from 'express';

import { AGENT_CARD_PATH, type AgentCard, type Message } from '@a2a-js/sdk';
import {
  type TaskStore,
  DefaultRequestHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBus,
  type AgentExecutionEvent,
  type User,
  UnauthenticatedUser,
} from '@a2a-js/sdk/server';
import { A2AExpressApp, type UserBuilder } from '@a2a-js/sdk/server/express'; // Import server components
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
import {
  debugLogger,
  SimpleExtensionLoader,
  GitService,
  checkPathTrust,
  isHeadlessMode,
} from '@google/gemini-cli-core';
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
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
    },
    basicAuth: {
      type: 'http',
      scheme: 'basic',
    },
  },
  security: [{ bearerAuth: [] }, { basicAuth: [] }],
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

// Constant-time comparison to avoid leaking credential length/content via timing.
function safeCompare(actual: string, expected: string): boolean {
  const actualBuf = Buffer.from(actual);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) {
    // Still run a same-length comparison so failure timing doesn't reveal length.
    timingSafeEqual(actualBuf, actualBuf);
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}

const customUserBuilder: UserBuilder = async (req: Request) => {
  const auth = req.headers['authorization'];
  if (!auth) return new UnauthenticatedUser();

  const expectedToken = process.env['CODER_AGENT_BEARER_TOKEN'];
  const expectedUser = process.env['CODER_AGENT_BASIC_USERNAME'];
  const expectedPassword = process.env['CODER_AGENT_BASIC_PASSWORD'];

  // 1. Bearer Auth
  if (auth.startsWith('Bearer ') && expectedToken) {
    const token = auth.substring(7);
    if (safeCompare(token, expectedToken)) {
      return { userName: 'bearer-user', isAuthenticated: true };
    }
  }

  // 2. Basic Auth
  if (auth.startsWith('Basic ') && expectedUser && expectedPassword) {
    const decoded = Buffer.from(auth.substring(6), 'base64').toString();
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex !== -1) {
      const user = decoded.slice(0, separatorIndex);
      const password = decoded.slice(separatorIndex + 1);
      if (
        safeCompare(user, expectedUser) &&
        safeCompare(password, expectedPassword)
      ) {
        return { userName: 'basic-user', isAuthenticated: true };
      }
    }
  }

  return new UnauthenticatedUser();
};

const wellKnownAgentCardPath = `/${AGENT_CARD_PATH}`;

/**
 * Enforces authentication on every request except the public agent card
 * (metadata only, meant to be fetched without credentials per the A2A
 * client convention). The SDK's own request handler only checks
 * `user.isAuthenticated` for the authenticated-extended-card method, not for
 * task-driving RPCs like message/send, so this must be enforced here for
 * every route -- including the custom /tasks, /executeCommand, /listCommands,
 * and /tasks/:taskId/metadata routes below, which are plain Express routes
 * the SDK never sees at all.
 */
function requireAuthentication(userBuilder: UserBuilder) {
  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (req.path === wellKnownAgentCardPath) {
      next();
      return;
    }
    const user: User = await userBuilder(req);
    if (!user.isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

async function handleExecuteCommand(
  req: express.Request,
  res: express.Response,
  context: {
    config: Awaited<ReturnType<typeof loadConfig>>;
    git: GitService | undefined;
    agentExecutor: CoderAgentExecutor;
  },
) {
  logger.info('[CoreAgent] Received /executeCommand request: ', req.body);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { command, args } = req.body;
  try {
    if (typeof command !== 'string') {
      return res.status(400).json({ error: 'Invalid "command" field.' });
    }

    if (args && !Array.isArray(args)) {
      return res.status(400).json({ error: '"args" field must be an array.' });
    }

    const commandToExecute = commandRegistry.get(command);

    if (commandToExecute?.requiresWorkspace) {
      if (!process.env['CODER_AGENT_WORKSPACE_PATH']) {
        return res.status(400).json({
          error: `Command "${command}" requires a workspace, but CODER_AGENT_WORKSPACE_PATH is not set.`,
        });
      }
    }

    if (!commandToExecute) {
      return res.status(404).json({ error: `Command not found: ${command}` });
    }

    if (commandToExecute.streaming) {
      const eventBus = new DefaultExecutionEventBus();
      res.setHeader('Content-Type', 'text/event-stream');
      const eventHandler = (event: AgentExecutionEvent) => {
        const jsonRpcResponse = {
          jsonrpc: '2.0',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          id: 'taskId' in event ? event.taskId : (event as Message).messageId,
          result: event,
        };
        res.write(`data: ${JSON.stringify(jsonRpcResponse)}\n`);
      };
      eventBus.on('event', eventHandler);

      await commandToExecute.execute({ ...context, eventBus }, args ?? []);

      eventBus.off('event', eventHandler);
      eventBus.finished();
      return res.end(); // Explicit return for streaming path
    } else {
      const result = await commandToExecute.execute(context, args ?? []);
      logger.info('[CoreAgent] Sending /executeCommand response: ', result);
      return res.status(200).json(result);
    }
  } catch (e) {
    logger.error(
      `Error executing /executeCommand: ${command} with args: ${JSON.stringify(
        args,
      )}`,
      e,
    );
    const errorMessage =
      e instanceof Error ? e.message : 'Unknown error executing command';
    return res.status(500).json({ error: errorMessage });
  }
}

export async function createApp() {
  try {
    // Load the server configuration once on startup.
    const workspaceRoot = await setTargetDir(undefined);

    // Use a temporary settings load to check if folder trust is enabled.
    // This is similar to how the CLI handles the initial trust check.
    const initialSettings = loadSettings(workspaceRoot, false);
    const { isTrusted } = checkPathTrust({
      path: workspaceRoot,
      isFolderTrustEnabled: initialSettings.folderTrust ?? true,
      isHeadless: isHeadlessMode(),
    });

    // Change the global working directory to the workspace root during startup
    process.chdir(workspaceRoot);

    // Load environment globally for the server startup
    const globalEnv = await loadEnvironment(isTrusted ?? false, workspaceRoot);
    // Only assign safe server-config variables to process.env to prevent credential leakage
    const allowedServerKeys = [
      'CODER_AGENT_PORT',
      'CODER_AGENT_WORKSPACE_PATH',
      'GCS_BUCKET_NAME',
      'LOG_LEVEL',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'GOOGLE_CLOUD_PROJECT',
      'GEMINI_CLI_USE_COMPUTE_ADC',
      'CODER_AGENT_BEARER_TOKEN',
      'CODER_AGENT_BASIC_USERNAME',
      'CODER_AGENT_BASIC_PASSWORD',
    ];
    for (const key of allowedServerKeys) {
      if (globalEnv[key] !== undefined) {
        process.env[key] = globalEnv[key];
      }
    }

    const settings = loadSettings(workspaceRoot, isTrusted ?? false);
    const extensions = loadExtensions(workspaceRoot, isTrusted ?? false);
    const config = await loadConfig(
      settings,
      new SimpleExtensionLoader(extensions),
      'a2a-server',
      isTrusted ?? false,
      workspaceRoot,
    );

    let git: GitService | undefined;
    if (config.getCheckpointingEnabled()) {
      git = new GitService(config.getTargetDir(), config.storage);
      await git.initialize();
    }

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

    const context = { config, git, agentExecutor };

    const requestHandler = new DefaultRequestHandler(
      coderAgentCard,
      taskStoreForHandler,
      agentExecutor,
    );

    let expressApp = express();
    expressApp.use((req, res, next) => {
      requestStorage.run({ req }, next);
    });
    expressApp.use(requireAuthentication(customUserBuilder));

    const appBuilder = new A2AExpressApp(requestHandler, customUserBuilder);
    expressApp = appBuilder.setupRoutes(expressApp, '');
    expressApp.use(express.json());

    expressApp.post('/tasks', async (req, res) => {
      try {
        const taskId = uuidv4();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const agentSettings = req.body.agentSettings as
          | AgentSettings
          | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

    expressApp.post('/executeCommand', (req, res) => {
      void handleExecuteCommand(req, res, context);
    });

    expressApp.get('/listCommands', (req, res) => {
      try {
        const transformCommand = (
          command: Command,
          visited: string[],
        ): CommandResponse | undefined => {
          const commandName = command.name;
          if (visited.includes(commandName)) {
            debugLogger.warn(
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
    const port = Number(process.env['CODER_AGENT_PORT'] || 0);

    const server = expressApp.listen(port, 'localhost', () => {
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
