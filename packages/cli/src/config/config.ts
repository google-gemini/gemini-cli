/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import { mcpCommand } from './mcp.js';
import {
  type GeminiContentGeneratorConfig,
  type Config,
  createTestMergedSettings,
  getDefaultsFromSchema,
  isRestrictiveSandbox,
  type LoadableSettingScope,
  loadSettings,
  RESUME_LATEST,
  SettingScope,
  AuthType,
  debugLogger,
  clearCachedCredentialFile,
  Config as ConfigImpl,
} from '@google/gemini-cli-core';
import { type MergedSettings } from './settingsSchema.js';
import { type SkillDefinition } from '../ui/types.js';
import { type HookDefinition, type HookEventName } from '@google/gemini-cli-core';

export interface CliArgs {
  model: string | undefined;
  sandbox: boolean | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  promptInteractive: boolean | undefined;
  query: string | undefined;
  yolo: boolean | undefined;
  approvalMode: string | undefined;
  policy: string[] | undefined;
  allowedMcpServerNames: string[] | undefined;
  allowedTools: string[] | undefined;
  experimentalAcp: boolean | undefined;
  extensions: string[] | undefined;
  listExtensions: boolean | undefined;
  includeDirectories: string[] | undefined;
  screenReader: boolean | undefined;
  compactToolOutputs: boolean | undefined;
  useWriteTodos: boolean | undefined;
  outputFormat: string | undefined;
  fakeResponses: string | undefined;
  recordResponses: string | undefined;
  startupMessages?: string[];
  resume: string | typeof RESUME_LATEST | undefined;
  listSessions: boolean | undefined;
  deleteSession: string | undefined;
  rawOutput: boolean | undefined;
  acceptRawOutputRisk: boolean | undefined;
  isCommand: boolean | undefined;
}

export async function parseArguments(rawArgs: string[]): Promise<CliArgs> {
  const argv = await yargs(hideBin(rawArgs))
    .usage('Usage: gemini [options] [command]')
    .option('model', {
      alias: 'm',
      type: 'string',
      description: 'Gemini model to use',
    })
    .option('query', {
      alias: 'q',
      type: 'string',
      description: 'Execute the provided prompt and exit (non-interactive)',
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'Execute the provided prompt and exit (non-interactive)',
    })
    .option('prompt-interactive', {
      alias: 'i',
      type: 'string',
      description:
        'Execute the provided prompt and continue in interactive mode',
    })
    .option('sandbox', {
      alias: 's',
      type: 'boolean',
      description: 'Run in sandbox?',
    })
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Enable debug mode',
    })
    .option('yolo', {
      alias: 'y',
      type: 'boolean',
      description: 'Enable YOLO mode (dangerous!)',
    })
    .option('approval-mode', {
      type: 'string',
      choices: ['default', 'auto_edit', 'plan', 'yolo'],
      description: 'The tool approval mode to use.',
    })
    .option('policy', {
      type: 'array',
      string: true,
      description: 'Paths to policy files or directories to load.',
    })
    .option('allowed-mcp-server', {
      type: 'array',
      string: true,
      description: 'Names of MCP servers to allow.',
    })
    .option('allowed-tool', {
      type: 'array',
      string: true,
      description: 'Names of tools to allow.',
    })
    .option('experimental-acp', {
      type: 'boolean',
      description: 'Enable experimental Agent Command Protocol.',
    })
    .option('extension', {
      alias: 'e',
      type: 'array',
      string: true,
      description: 'Path or URL to an extension to load.',
    })
    .option('list-extensions', {
      type: 'boolean',
      description: 'List installed extensions.',
    })
    .option('include-directories', {
      type: 'array',
      string: true,
      description: 'Additional directories to include in the workspace.',
    })
    .option('screen-reader', {
      type: 'boolean',
      description: 'Enable screen reader mode for accessibility.',
    })
    .option('compact-tool-outputs', {
      type: 'boolean',
      description: 'Show tool outputs in a compact summary by default',
    })
    .option('output-format', {
      alias: 'o',
      type: 'string',
      nargs: 1,
      description: 'The format of the CLI output.',
      choices: ['text', 'json', 'stream-json'],
    })
    .option('fake-responses', {
      type: 'string',
      description: 'Path to a file containing fake responses for testing.',
    })
    .option('record-responses', {
      type: 'string',
      description: 'Path to a file to record responses to for testing.',
    })
    .option('resume', {
      alias: 'r',
      type: 'string',
      nargs: 1,
      description:
        'Resume a previous session by ID. Use "latest" to resume the most recent session.',
    })
    .option('list-sessions', {
      alias: 'ls',
      type: 'boolean',
      description: 'List previous sessions.',
    })
    .option('delete-session', {
      type: 'string',
      nargs: 1,
      description: 'Delete a previous session by ID.',
    })
    .option('raw-output', {
      type: 'boolean',
      description:
        'Show raw tool output. WARNING: This may expose sensitive information.',
    })
    .option('accept-raw-output-risk', {
      type: 'boolean',
      description:
        'Accept the risk of using --raw-output. Must be used with --raw-output.',
    })
    // Register MCP subcommands
    .command(mcpCommand)
    // Ensure validation flows through .fail() for clean UX
    .fail((msg, err) => {
      if (err) throw err;
      throw new Error(msg);
    })
    .parse();

  return {
    model: argv.model,
    sandbox: argv.sandbox,
    debug: argv.debug,
    prompt: argv.prompt || argv.query,
    promptInteractive: argv['prompt-interactive'],
    yolo: argv.yolo,
    approvalMode: argv['approval-mode'],
    policy: argv.policy,
    allowedMcpServerNames: argv['allowed-mcp-server'],
    allowedTools: argv['allowed-tool'],
    experimentalAcp: argv['experimental-acp'],
    extensions: argv.extension,
    listExtensions: argv['list-extensions'],
    includeDirectories: argv['include-directories'],
    screenReader: argv['screen-reader'],
    compactToolOutputs: argv['compact-tool-outputs'],
    useWriteTodos: undefined, // Will be loaded from settings
    outputFormat: argv['output-format'],
    fakeResponses: argv['fake-responses'],
    recordResponses: argv['record-responses'],
    resume: argv.resume,
    listSessions: argv['list-sessions'],
    deleteSession: argv['delete-session'],
    rawOutput: argv['raw-output'],
    acceptRawOutputRisk: argv['accept-raw-output-risk'],
    isCommand: false, // Default value
  };
}

export async function loadCliConfig(
  argv: CliArgs,
  settings: MergedSettings,
  sessionId: string,
  extra: {
    projectHooks?: { [K in HookEventName]?: HookDefinition[] } & {
      disabled?: string[];
    };
    startupWarnings?: string[];
  } = {},
): Promise<Config> {
  const isInteractive =
    !argv.prompt && !argv.query && !argv.promptInteractive && !argv.isCommand;

  const ideMode = settings.ide.enabled;

  return new ConfigImpl({
    sessionId,
    model: argv.model || settings.model.name || '',
    sandbox: argv.sandbox ?? settings.tools.sandbox ? { command: 'sandbox-exec', image: '' } : undefined,
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: argv.debug ?? false,
    question: argv.prompt || argv.query || argv.promptInteractive,
    interactive: isInteractive || !!argv.promptInteractive,
    coreTools: settings.tools.core,
    allowedTools: settings.tools.allowed,
    excludeTools: settings.tools.exclude,
    toolDiscoveryCommand: settings.tools.discoveryCommand,
    toolCallCommand: settings.tools.callCommand,
    mcpServerCommand: settings.mcp.serverCommand,
    mcpServers: settings.mcpServers,
    allowedMcpServers: settings.mcp.allowed,
    blockedMcpServers: settings.mcp.excluded,
    allowedEnvironmentVariables:
      settings.security.environmentVariableRedaction.allowed,
    blockedEnvironmentVariables:
      settings.security.environmentVariableRedaction.blocked,
    enableEnvironmentVariableRedaction:
      settings.security.environmentVariableRedaction.enabled,
    contextFileName: settings.context.fileName,
    accessibility: settings.ui.accessibility,
    telemetry: settings.telemetry,
    usageStatisticsEnabled: settings.privacy.usageStatisticsEnabled,
    fileFiltering: settings.context.fileFiltering,
    includeDirectories: argv.includeDirectories || settings.context.includeDirectories,
    bugCommand: settings.advanced.bugCommand,
    maxSessionTurns: settings.model.maxSessionTurns,
    experimentalJitContext: settings.experimental?.jitContext,
    modelSteering: settings.experimental?.modelSteering,
    toolOutputMasking: settings.experimental?.toolOutputMasking,
    compactToolOutputs: argv.compactToolOutputs ?? settings.ui.compactToolOutputs,
    noBrowser: !!process.env['NO_BROWSER'],
    summarizeToolOutput: settings.model?.summarizeToolOutput,
    ideMode,
    disableLoopDetection: settings.model?.disableLoopDetection,
    compressionThreshold: settings.model?.compressionThreshold,
    useBackgroundColor: settings.ui.useBackgroundColor,
    useAlternateBuffer: settings.ui.useAlternateBuffer,
    useRipgrep: settings.tools.useRipgrep,
    enableInteractiveShell: settings.tools.shell.enableInteractiveShell,
    skipNextSpeakerCheck: settings.model.skipNextSpeakerCheck,
    extensionManagement: settings.experimental?.extensionManagement,
    truncateToolOutputThreshold: settings.tools.truncateToolOutputThreshold,
    useWriteTodos: settings.useWriteTodos,
    policyEngineConfig: {
      policyPaths: settings.policyPaths,
    },
    directWebFetch: settings.experimental?.directWebFetch,
    output: settings.output,
    gemmaModelRouter: settings.experimental?.gemmaModelRouter,
    retryFetchErrors: settings.general.retryFetchErrors,
    maxAttempts: settings.general.maxAttempts,
    enableShellOutputEfficiency: settings.tools.shell.enableShellOutputEfficiency,
    shellToolInactivityTimeout: settings.tools.shell.inactivityTimeout,
    fakeResponses: argv.fakeResponses,
    recordResponses: argv.recordResponses,
    disableYoloMode: settings.security.disableYoloMode,
    rawOutput: argv.rawOutput,
    acceptRawOutputRisk: argv.acceptRawOutputRisk,
    modelConfigServiceConfig: settings.modelConfigs,
    enableHooks: settings.hooksConfig.enabled,
    disabledHooks: settings.hooksConfig.disabled,
    hooks: settings.hooks as any,
    projectHooks: extra.projectHooks,
    enableAgents: settings.experimental?.enableAgents,
    skillsSupport: settings.skills?.enabled ?? true,
    disabledSkills: settings.skills?.disabled,
    adminSkillsEnabled: true, // Should be fetched from admin controls
    agents: settings.agents,
    enableConseca: settings.security.enableConseca,
    billing: settings.billing,
  });
}

export function mergeExcludeTools(
  settings: MergedSettings,
  extraExcludes: string[] = [],
): string[] {
  const allExcludeTools = new Set([
    ...(settings.tools.exclude || []),
    ...extraExcludes,
  ]);
  return Array.from(allExcludeTools);
}
