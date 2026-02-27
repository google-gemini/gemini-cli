/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentCard, Message } from '@a2a-js/sdk';
import type { TaskStore } from '@a2a-js/sdk/server';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  InMemoryPushNotificationStore,
  DefaultPushNotificationSender,
  DefaultExecutionEventBusManager,
  DefaultExecutionEventBus,
  type AgentExecutionEvent,
} from '@a2a-js/sdk/server';
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
import { debugLogger, SimpleExtensionLoader } from '@google/gemini-cli-core';
import type { Command, CommandArgument } from '../commands/types.js';
import { GitService } from '@google/gemini-cli-core';

type CommandResponse = {
  name: string;
  description: string;
  arguments: CommandArgument[];
  subCommands: CommandResponse[];
};

const a2aBearerToken = process.env['A2A_BEARER_TOKEN']?.trim();
const a2aAuthEnabled = Boolean(a2aBearerToken);
const a2aSecuritySchemes = a2aAuthEnabled
  ? {
    bearerAuth: {
      type: 'http' as const,
      scheme: 'bearer',
      description: 'Bearer token required for A2A endpoints',
    },
  }
  : undefined;
const a2aSecurityRequirements = a2aAuthEnabled ? [{ bearerAuth: [] }] : undefined;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const coderAgentCard: AgentCard = {
  name: process.env['AGENT_CARD_NAME'] || 'Gemini Agent',
  description:
    process.env['AGENT_CARD_DESCRIPTION'] || 'An AI coding agent powered by Gemini CLI.',
  url: 'http://localhost:41242/',
  provider: {
    organization: 'Google',
    url: 'https://google.com',
  },
  protocolVersion: '0.3.0',
  version: '0.0.2', // Incremented version
  capabilities: {
    streaming: true,
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  securitySchemes: a2aSecuritySchemes,
  security: a2aSecurityRequirements,
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
  supportsAuthenticatedExtendedCard: a2aAuthEnabled,
};

export function updateCoderAgentCardUrl(port: number) {
  coderAgentCard.url = `http://localhost:${port}/`;
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
    const workspaceRoot = setTargetDir(undefined);
    loadEnvironment();
    const settings = loadSettings(workspaceRoot);
    const extensions = loadExtensions(workspaceRoot);
    const config = await loadConfig(
      settings,
      new SimpleExtensionLoader(extensions),
      'a2a-server',
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

    // Wire up A2A Push Notification support (spec Section 3.5.3)
    const eventBusManager = new DefaultExecutionEventBusManager();
    const pushNotificationStore = new InMemoryPushNotificationStore();
    const pushNotificationSender = new DefaultPushNotificationSender(
      pushNotificationStore,
    );

    const requestHandler = new DefaultRequestHandler(
      coderAgentCard,
      taskStoreForHandler,
      agentExecutor,
      eventBusManager,
      pushNotificationStore,
      pushNotificationSender,
      coderAgentCard,
    );

    let expressApp = express();
    expressApp.use((req, res, next) => {
      requestStorage.run({ req }, next);
    });
    if (a2aBearerToken) {
      expressApp.use((req, res, next) => {
        const authHeader = req.header('authorization');
        if (authHeader === `Bearer ${a2aBearerToken}`) {
          return next();
        }
        res.setHeader('WWW-Authenticate', 'Bearer realm="a2a-server"');
        return res.status(401).json({
          error: 'Missing or invalid bearer token',
        });
      });
    }

    const appBuilder = new A2AExpressApp(requestHandler);
    expressApp = appBuilder.setupRoutes(expressApp, '');
    expressApp.use(express.json());

    expressApp.post('/tasks', async (req, res) => {
      try {
        const taskId = uuidv4();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

    expressApp.post('/reload-agents', async (_req, res) => {
      try {
        logger.info('[CoreAgent] Reloading agent registry...');
        const agentRegistry = config.getAgentRegistry();
        await agentRegistry.reload();
        // Re-register the reloaded agents as tools so the LLM can invoke them
        config.refreshSubAgentTools();
        const agents = agentRegistry.getAllDefinitions();
        const agentNames = agents.map((a) => a.name);

        // Kill and respawn ACP bridge so the child process also reloads agents!
        if (childProcess) {
          logger.info('[CoreAgent] Restarting ACP bridge to apply new agents...');
          childProcess.kill();
          childProcess = null;
          spawnAcpBridge();
        }

        logger.info(
          `[CoreAgent] Agent registry reloaded. Agents: ${agentNames.join(', ')}`,
        );
        res.status(200).json({ reloaded: true, agents: agentNames });
      } catch (error) {
        logger.error('[CoreAgent] Error reloading agents:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unknown error reloading agents';
        res.status(500).json({ error: errorMessage });
      }
    });

    // --- Raw ACP HTTP Bridge logic ---
    let childProcess: ChildProcess | null = null;
    let sseClients: express.Response[] = [];

    const spawnAcpBridge = () => {
      if (childProcess) return;
      const spawnArgs = ['--experimental-acp'];
      const model = (process.env['CODER_AGENT_MODEL'] || process.env['GEMINI_MODEL'] || '').trim();
      if (model) spawnArgs.push('--model', model);
      const env = { ...process.env, A2A_SERVER: 'true', GEMINI_YOLO_MODE: 'true' };

      logger.info(`Spawning gemini ${spawnArgs.join(' ')} for ACP bridging`);
      const bundlePath = path.resolve(__dirname, '../../../bundle/gemini.js');

      childProcess = spawn(process.execPath, [bundlePath, ...spawnArgs], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env
      });

      childProcess?.on('error', (err: Error) => {
        logger.error(`Failed to spawn ACP child process: ${err.message}`);
      });

      if (childProcess?.stdout) {
        const rl = createInterface({ input: childProcess.stdout });
        rl.on('line', (line: string) => {
          if (!line.trim()) return;
          try {
            const data = JSON.parse(line);
            // Diagnostic: check rawInput in subprocess output
            if (data?.params?.update?.sessionUpdate === 'tool_call') {
              const hasRaw = 'rawInput' in (data.params.update || {});
              logger.info(`[ACP Bridge] tool_call id=${data.params?.update?.toolCallId} hasRawInput=${hasRaw}`);
            }
            const ssePayload = `data: ${JSON.stringify(data)}\n\n`;
            for (const client of sseClients) {
              client.write(ssePayload);
            }
          } catch (e) {
            logger.error("Invalid JSON from child:", line);
          }
        });
      }

      childProcess?.on('exit', () => {
        logger.info("ACP Child process exited");
        childProcess = null;
        for (const client of sseClients) {
          client.end();
        }
        sseClients = [];
      });
    };

    // Eagerly spawn it so there's no cold start
    spawnAcpBridge();

    expressApp.post('/shutdown', (req, res) => {
      logger.info("Received /shutdown request");
      if (childProcess) childProcess.kill();
      res.status(200).send("OK");
      setTimeout(() => process.exit(0), 100);
    });

    expressApp.post('/acp', (req, res) => {
      if (!childProcess || !childProcess.stdin) {
        return res.status(500).json({ error: "Agent not connected" });
      }
      const payload = JSON.stringify(req.body) + "\n";
      childProcess.stdin.write(payload);
      return res.status(200).send("");
    });

    expressApp.get('/acp/stream', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(': connected\n\n');
      sseClients.push(res);

      const keepAliveInterval = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15000);

      spawnAcpBridge();

      req.on('close', () => {
        clearInterval(keepAliveInterval);
        sseClients = sseClients.filter(c => c !== res);
        logger.info("An SSE client disconnected. Active clients: " + sseClients.length);
      });
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
