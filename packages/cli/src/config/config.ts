/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import { mcpCommand } from '../commands/mcp.js';
import { extensionsCommand } from '../commands/extensions.js';
import { skillsCommand } from '../commands/skills.js';
import { hooksCommand } from '../commands/hooks.js';
import {
  Config,
  setGeminiMdFilename as setServerGeminiMdFilename,
  getCurrentGeminiMdFilename,
  ApprovalMode,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_FILE_FILTERING_OPTIONS,
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
  FileDiscoveryService,
  WRITE_FILE_TOOL_NAME,
  SHELL_TOOL_NAMES,
  SHELL_TOOL_NAME,
  resolveTelemetrySettings,
  FatalConfigError,
  getPty,
  EDIT_TOOL_NAME,
  debugLogger,
  loadServerHierarchicalMemory,
  WEB_FETCH_TOOL_NAME,
  getVersion,
  PREVIEW_GEMINI_MODEL_AUTO,
  type HookDefinition,
  type HookEventName,
  type OutputFormat,
  GEMINI_MODEL_ALIAS_AUTO,
} from '@google/gemini-cli-core';
import {
  type Settings,
  type MergedSettings,
  saveModelChange,
  loadSettings,
} from './settings.js';

import { loadSandboxConfig } from './sandboxConfig.js';
import { resolvePath } from '../utils/resolvePath.js';
import { appEvents } from '../utils/events.js';
import { RESUME_LATEST } from '../utils/sessionUtils.js';

import { isWorkspaceTrusted } from './trustedFolders.js';
import { createPolicyEngineConfig } from './policy.js';
import { ExtensionManager } from './extension-manager.js';
import type { ExtensionEvents } from '@google/gemini-cli-core/src/utils/extensionLoader.js';
import { requestConsentNonInteractive } from './extensions/consent.js';
import { promptForSetting } from './extensions/extensionSettings.js';
import type { EventEmitter } from 'node:stream';
import { runExitCleanup } from '../utils/cleanup.js';

export interface CliArgs {
  query: string | undefined;
  model: string | undefined;
  sandbox: boolean | string | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  promptInteractive: string | undefined;

  yolo: boolean | undefined;
  approvalMode: string | undefined;
  allowedMcpServerNames: string[] | undefined;
  allowedTools: string[] | undefined;
  experimentalAcp: boolean | undefined;
  extensions: string[] | undefined;
  listExtensions: boolean | undefined;
  resume: string | typeof RESUME_LATEST | undefined;
  listSessions: boolean | undefined;
  deleteSession: string | undefined;
  includeDirectories: string[] | undefined;
  screenReader: boolean | undefined;
  useWriteTodos: boolean | undefined;
  outputFormat: string | undefined;
  fakeResponses: string | undefined;
  recordResponses: string | undefined;
}

export async function parseArguments(
  settings: MergedSettings,
): Promise<CliArgs> {
  const rawArgv = hideBin(process.argv);
  const yargsInstance = yargs(rawArgv)
    .locale('en')
    .scriptName('gemini')
    .usage(
      'Usage: gemini [options] [command]\n\nGemini CLI - Launch an interactive CLI, use -p/--prompt for non-interactive mode',
    )

    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Run in debug mode (open debug console with F12)',
      default: false,
    })
    .command('$0 [query..]', 'Launch Gemini CLI', (yargsInstance) =>
      yargsInstance
        .positional('query', {
          description:
            'Positional prompt. Defaults to one-shot; use -i/--prompt-interactive for interactive.',
        })
        .option('model', {
          alias: 'm',
          type: 'string',
          nargs: 1,
          description: `Model`,
        })
        .option('prompt', {
          alias: 'p',
          type: 'string',
          nargs: 1,
          description: 'Prompt. Appended to input on stdin (if any).',
        })
        .option('prompt-interactive', {
          alias: 'i',
          type: 'string',
          nargs: 1,
          description:
            'Execute the provided prompt and continue in interactive mode',
        })
        .option('sandbox', {
          alias: 's',
          type: 'boolean',
          description: 'Run in sandbox?',
        })

        .option('yolo', {
          alias: 'y',
          type: 'boolean',
          description:
            'Automatically accept all actions (aka YOLO mode, see https://www.youtube.com/watch?v=xvFZjo5PgG0 for more details)?',
          default: false,
        })
        .option('approval-mode', {
          type: 'string',
          nargs: 1,
          choices: ['default', 'auto_edit', 'yolo', 'plan'],
          description:
            'Set the approval mode: default (prompt for approval), auto_edit (auto-approve edit tools), yolo (auto-approve all tools), plan (read-only mode)',
        })
        .option('experimental-acp', {
          type: 'boolean',
          description: 'Starts the agent in ACP mode',
        })
        .option('allowed-mcp-server-names', {
          type: 'array',
          string: true,
          nargs: 1,
          description: 'Allowed MCP server names',
          coerce: (mcpServerNames: string[]) =>
            // Handle comma-separated values
            mcpServerNames.flatMap((mcpServerName) =>
              mcpServerName.split(',').map((m) => m.trim()),
            ),
        })
        .option('allowed-tools', {
          type: 'array',
          string: true,
          nargs: 1,
          description: 'Tools that are allowed to run without confirmation',
          coerce: (tools: string[]) =>
            // Handle comma-separated values
            tools.flatMap((tool) => tool.split(',').map((t) => t.trim())),
        })
        .option('extensions', {
          alias: 'e',
          type: 'array',
          string: true,
          nargs: 1,
          description:
            'A list of extensions to use. If not provided, all extensions are used.',
          coerce: (extensions: string[]) =>
            // Handle comma-separated values
            extensions.flatMap((extension) =>
              extension.split(',').map((e) => e.trim()),
            ),
        })
        .option('list-extensions', {
          alias: 'l',
          type: 'boolean',
          description: 'List all available extensions and exit.',
        })
        .option('resume', {
          alias: 'r',
          type: 'string',
          // `skipValidation` so that we can distinguish between it being passed with a value, without
          // one, and not being passed at all.
          skipValidation: true,
          description:
            'Resume a previous session. Use "latest" for most recent or index number (e.g. --resume 5)',
          coerce: (value: string): string => {
            // When --resume passed with a value (`gemini --resume 123`): value = "123" (string)
            // When --resume passed without a value (`gemini --resume`): value = "" (string)
            // When --resume not passed at all: this `coerce` function is not called at all, and
            //   `yargsInstance.argv.resume` is undefined.
            if (value === '') {
              return RESUME_LATEST;
            }
            return value;
          },
        })
        .option('list-sessions', {
          type: 'boolean',
          description:
            'List available sessions for the current project and exit.',
        })
        .option('delete-session', {
          type: 'string',
          description:
            'Delete a session by index number (use --list-sessions to see available sessions).',
        })
        .option('include-directories', {
          type: 'array',
          string: true,
          nargs: 1,
          description:
            'Additional directories to include in the workspace (comma-separated or multiple --include-directories)',
          coerce: (dirs: string[]) =>
            // Handle comma-separated values
            dirs.flatMap((dir) => dir.split(',').map((d) => d.trim())),
        })
        .option('screen-reader', {
          type: 'boolean',
          description: 'Enable screen reader mode for accessibility.',
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
          description: 'Path to a file with fake model responses for testing.',
          hidden: true,
        })
        .option('record-responses', {
          type: 'string',
          description: 'Path to a file to record model responses for testing.',
          hidden: true,
        }),
    )
    // Register MCP subcommands
    .command(mcpCommand)
    // Ensure validation flows through .fail() for clean UX
    .fail((msg, err) => {
      if (err) throw err;
      throw new Error(msg);
    })
    .check((argv) => {
      // The 'query' positional can be a string (for one arg) or string[] (for multiple).
      // This guard safely checks if any positional argument was provided.
      const query = argv['query'] as string | string[] | undefined;
      const hasPositionalQuery = Array.isArray(query)
        ? query.length > 0
        : !!query;

      if (argv['prompt'] && hasPositionalQuery) {
        return 'Cannot use both a positional prompt and the --prompt (-p) flag together';
      }
      if (argv['prompt'] && argv['promptInteractive']) {
        return 'Cannot use both --prompt (-p) and --prompt-interactive (-i) together';
      }
      if (argv['yolo'] && argv['approvalMode']) {
        return 'Cannot use both --yolo (-y) and --approval-mode together. Use --approval-mode=yolo instead.';
      }
      if (
        argv['outputFormat'] &&
        !['text', 'json', 'stream-json'].includes(
          argv['outputFormat'] as string,
        )
      ) {
        return `Invalid values:\n  Argument: output-format, Given: "${argv['outputFormat']}", Choices: "text", "json", "stream-json"`;
      }
      return true;
    });

  if (settings.experimental.extensionManagement) {
    yargsInstance.command(extensionsCommand);
  }

  if (settings.experimental.skills) {
    yargsInstance.command(skillsCommand);
  }

  // Register hooks command if hooks are enabled
  if (settings.tools.enableHooks) {
    yargsInstance.command(hooksCommand);
  }

  yargsInstance
    .version(await getVersion()) // This will enable the --version flag based on package.json
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict()
    .demandCommand(0, 0) // Allow base command to run with no subcommands
    .exitProcess(false);

  yargsInstance.wrap(yargsInstance.terminalWidth());
  let result;
  try {
    result = await yargsInstance.parse();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugLogger.error(msg);
    yargsInstance.showHelp();
    await runExitCleanup();
    process.exit(1);
  }

  // Handle help and version flags manually since we disabled exitProcess
  if (result['help'] || result['version']) {
    await runExitCleanup();
    process.exit(0);
  }

  // Normalize query args: handle both quoted "@path file" and unquoted @path file
  const queryArg = (result as { query?: string | string[] | undefined }).query;
  const q: string | undefined = Array.isArray(queryArg)
    ? queryArg.join(' ')
    : queryArg;

  // Route positional args: explicit -i flag -> interactive; else -> one-shot (even for @commands)
  if (q && !result['prompt']) {
    const hasExplicitInteractive =
      result['promptInteractive'] === '' || !!result['promptInteractive'];
    if (hasExplicitInteractive) {
      result['promptInteractive'] = q;
    } else {
      result['prompt'] = q;
    }
  }

  // Keep CliArgs.query as a string for downstream typing
  (result as Record<string, unknown>)['query'] = q || undefined;

  // The import format is now only controlled by settings.memoryImportFormat
  // We no longer accept it as a CLI argument
  return result as unknown as CliArgs;
}

/**
 * Creates a filter function to determine if a tool should be excluded.
 *
 * In non-interactive mode, we want to disable tools that require user
 * interaction to prevent the CLI from hanging. This function creates a predicate
 * that returns `true` if a tool should be excluded.
 *
 * A tool is excluded if it's not in the `allowedToolsSet`. The shell tool
 * has a special case: it's not excluded if any of its subcommands
 * are in the `allowedTools` list.
 *
 * @param allowedTools A list of explicitly allowed tool names.
 * @param allowedToolsSet A set of explicitly allowed tool names for quick lookups.
 * @returns A function that takes a tool name and returns `true` if it should be excluded.
 */
function createToolExclusionFilter(
  allowedTools: string[],
  allowedToolsSet: Set<string>,
) {
  return (tool: string): boolean => {
    if (tool === SHELL_TOOL_NAME) {
      // If any of the allowed tools is ShellTool (even with subcommands), don't exclude it.
      return !allowedTools.some((allowed) =>
        SHELL_TOOL_NAMES.some((shellName) => allowed.startsWith(shellName)),
      );
    }
    return !allowedToolsSet.has(tool);
  };
}

export function isDebugMode(argv: CliArgs): boolean {
  return (
    argv.debug ||
    [process.env['DEBUG'], process.env['DEBUG_MODE']].some(
      (v) => v === 'true' || v === '1',
    )
  );
}

export interface LoadCliConfigOptions {
  cwd?: string;
  projectHooks?: { [K in HookEventName]?: HookDefinition[] } & {
    disabled?: string[];
  };
}

export async function loadCliConfig(
  settings: MergedSettings,
  sessionId: string,
  argv: CliArgs,
  options: LoadCliConfigOptions = {},
): Promise<Config> {
  const { cwd = process.cwd(), projectHooks } = options;
  const debugMode = isDebugMode(argv);

  const loadedSettings = loadSettings(cwd);

  if (argv.sandbox) {
    process.env['GEMINI_SANDBOX'] = 'true';
  }

  const memoryImportFormat = settings.context?.importFormat || 'tree';

  const ideMode = settings.ide?.enabled ?? false;

  const folderTrust = settings.security?.folderTrust?.enabled ?? false;
  const trustedFolder = isWorkspaceTrusted(settings)?.isTrusted ?? false;

  // Set the context filename in the server's memoryTool module BEFORE loading memory
  // TODO(b/343434939): This is a bit of a hack. The contextFileName should ideally be passed
  // directly to the Config constructor in core, and have core handle setGeminiMdFilename.
  // However, loadHierarchicalGeminiMemory is called *before* createServerConfig.
  if (settings.context?.fileName) {
    setServerGeminiMdFilename(settings.context.fileName);
  } else {
    // Reset to default if not provided in settings.
    setServerGeminiMdFilename(getCurrentGeminiMdFilename());
  }

  const fileService = new FileDiscoveryService(cwd);

  const memoryFileFiltering = {
    ...DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
    ...settings.context?.fileFiltering,
  };

  const fileFiltering = {
    ...DEFAULT_FILE_FILTERING_OPTIONS,
    ...settings.context?.fileFiltering,
  };

  const includeDirectories = (settings.context?.includeDirectories || [])
    .map(resolvePath)
    .concat((argv.includeDirectories || []).map(resolvePath));

  const extensionManager = new ExtensionManager({
    settings,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    workspaceDir: cwd,
    enabledExtensionOverrides: argv.extensions,
    eventEmitter: appEvents as EventEmitter<ExtensionEvents>,
  });
  await extensionManager.loadExtensions();

  const experimentalJitContext = settings.experimental?.jitContext ?? false;

  let memoryContent = '';
  let fileCount = 0;
  let filePaths: string[] = [];

  if (!experimentalJitContext) {
    // Call the (now wrapper) loadHierarchicalGeminiMemory which calls the server's version
    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      debugMode,
      fileService,
      extensionManager,
      trustedFolder,
      memoryImportFormat,
      memoryFileFiltering,
      settings.context?.discoveryMaxDirs,
    );
    memoryContent = result.memoryContent;
    fileCount = result.fileCount;
    filePaths = result.filePaths;
  }

  const question = argv.promptInteractive || argv.prompt || '';

  // Determine approval mode with backward compatibility
  let approvalMode: ApprovalMode;
  if (argv.approvalMode) {
    // New --approval-mode flag takes precedence
    switch (argv.approvalMode) {
      case 'yolo':
        approvalMode = ApprovalMode.YOLO;
        break;
      case 'auto_edit':
        approvalMode = ApprovalMode.AUTO_EDIT;
        break;
      case 'plan':
        if (!(settings.experimental?.plan ?? false)) {
          throw new Error(
            'Approval mode "plan" is only available when experimental.plan is enabled.',
          );
        }
        approvalMode = ApprovalMode.PLAN;
        break;
      case 'default':
        approvalMode = ApprovalMode.DEFAULT;
        break;
      default:
        throw new Error(
          `Invalid approval mode: ${argv.approvalMode}. Valid values are: yolo, auto_edit, plan, default`,
        );
    }
  } else {
    // Fallback to legacy --yolo flag behavior
    approvalMode =
      argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT;
  }

  // Override approval mode if disableYoloMode is set.
  if (settings.security?.disableYoloMode || settings.admin?.secureModeEnabled) {
    if (approvalMode === ApprovalMode.YOLO) {
      if (settings.admin?.secureModeEnabled) {
        debugLogger.error(
          'YOLO mode is disabled by "secureModeEnabled" setting.',
        );
      } else {
        debugLogger.error(
          'YOLO mode is disabled by the "disableYolo" setting.',
        );
      }
      throw new FatalConfigError(
        'Cannot start in YOLO mode since it is disabled by your admin',
      );
    }
  } else if (approvalMode === ApprovalMode.YOLO) {
    debugLogger.warn(
      'YOLO mode is enabled. All tool calls will be automatically approved.',
    );
  }

  // Force approval mode to default if the folder is not trusted.
  if (!trustedFolder && approvalMode !== ApprovalMode.DEFAULT) {
    debugLogger.warn(
      `Approval mode overridden to "default" because the current folder is not trusted.`,
    );
    approvalMode = ApprovalMode.DEFAULT;
  }

  let telemetrySettings;
  try {
    telemetrySettings = await resolveTelemetrySettings({
      env: process.env as unknown as Record<string, string | undefined>,
      settings: settings.telemetry,
    });
  } catch (err) {
    if (err instanceof FatalConfigError) {
      throw new FatalConfigError(
        `Invalid telemetry configuration: ${err.message}.`,
      );
    }
    throw err;
  }

  // Interactive mode: explicit -i flag or (TTY + no args + no -p flag)
  const hasQuery = !!argv.query;
  const interactive =
    !!argv.promptInteractive ||
    !!argv.experimentalAcp ||
    (process.stdin.isTTY && !hasQuery && !argv.prompt);

  const allowedTools = argv.allowedTools || settings.tools?.allowed || [];
  const allowedToolsSet = new Set(allowedTools);

  // In non-interactive mode, exclude tools that require a prompt.
  const extraExcludes: string[] = [];
  if (!interactive) {
    const defaultExcludes = [
      SHELL_TOOL_NAME,
      EDIT_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      WEB_FETCH_TOOL_NAME,
    ];
    const autoEditExcludes = [SHELL_TOOL_NAME];

    const toolExclusionFilter = createToolExclusionFilter(
      allowedTools,
      allowedToolsSet,
    );

    switch (approvalMode) {
      case ApprovalMode.PLAN:
        // In plan non-interactive mode, all tools that require approval are excluded.
        // TODO(#16625): Replace this default exclusion logic with specific rules for plan mode.
        extraExcludes.push(...defaultExcludes.filter(toolExclusionFilter));
        break;
      case ApprovalMode.DEFAULT:
        // In default non-interactive mode, all tools that require approval are excluded.
        extraExcludes.push(...defaultExcludes.filter(toolExclusionFilter));
        break;
      case ApprovalMode.AUTO_EDIT:
        // In auto-edit non-interactive mode, only tools that still require a prompt are excluded.
        extraExcludes.push(...autoEditExcludes.filter(toolExclusionFilter));
        break;
      case ApprovalMode.YOLO:
        // No extra excludes for YOLO mode.
        break;
      default:
        // This should never happen due to validation earlier, but satisfies the linter
        break;
    }
  }

  const excludeTools = mergeExcludeTools(settings, extraExcludes);

  // Create a settings object that includes CLI overrides for policy generation
  const effectiveSettings: Settings = {
    ...settings,
    tools: {
      ...settings.tools,
      allowed: allowedTools,
      exclude: excludeTools,
    },
    mcp: {
      ...settings.mcp,
      allowed: argv.allowedMcpServerNames ?? settings.mcp?.allowed,
    },
  };

  const policyEngineConfig = await createPolicyEngineConfig(
    effectiveSettings,
    approvalMode,
  );
  policyEngineConfig.nonInteractive = !interactive;

  const defaultModel = settings.general?.previewFeatures
    ? PREVIEW_GEMINI_MODEL_AUTO
    : DEFAULT_GEMINI_MODEL_AUTO;
  const specifiedModel =
    argv.model || process.env['GEMINI_MODEL'] || settings.model?.name;

  const resolvedModel =
    specifiedModel === GEMINI_MODEL_ALIAS_AUTO
      ? defaultModel
      : specifiedModel || defaultModel;
  const sandboxConfig = await loadSandboxConfig(settings, argv);
  const screenReader =
    argv.screenReader !== undefined
      ? argv.screenReader
      : (settings.ui?.accessibility?.screenReader ?? false);

  const ptyInfo = await getPty();

  const mcpEnabled = settings.admin?.mcp?.enabled ?? true;
  const extensionsEnabled = settings.admin?.extensions?.enabled ?? true;
  const adminSkillsEnabled = settings.admin?.skills?.enabled ?? true;

  return new Config({
    sessionId,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: sandboxConfig,
    targetDir: cwd,
    includeDirectories,
    loadMemoryFromIncludeDirectories:
      settings.context?.loadMemoryFromIncludeDirectories || false,
    debugMode,
    question,
    previewFeatures: settings.general?.previewFeatures,

    coreTools: settings.tools?.core || undefined,
    allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
    policyEngineConfig,
    excludeTools,
    toolDiscoveryCommand: settings.tools?.discoveryCommand,
    toolCallCommand: settings.tools?.callCommand,
    mcpServerCommand: mcpEnabled ? settings.mcp?.serverCommand : undefined,
    mcpServers: mcpEnabled ? settings.mcpServers : {},
    mcpEnabled,
    extensionsEnabled,
    agents: settings.agents,
    adminSkillsEnabled,
    allowedMcpServers: mcpEnabled
      ? (argv.allowedMcpServerNames ?? settings.mcp?.allowed)
      : undefined,
    blockedMcpServers: mcpEnabled
      ? argv.allowedMcpServerNames
        ? undefined
        : settings.mcp?.excluded
      : undefined,
    blockedEnvironmentVariables:
      settings.security?.environmentVariableRedaction?.blocked,
    enableEnvironmentVariableRedaction:
      settings.security?.environmentVariableRedaction?.enabled,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    geminiMdFilePaths: filePaths,
    approvalMode,
    disableYoloMode:
      settings.security?.disableYoloMode || settings.admin?.secureModeEnabled,
    showMemoryUsage: settings.ui?.showMemoryUsage || false,
    accessibility: {
      ...settings.ui?.accessibility,
      screenReader,
    },
    telemetry: telemetrySettings,
    usageStatisticsEnabled: settings.privacy?.usageStatisticsEnabled,
    fileFiltering,
    checkpointing: settings.general?.checkpointing?.enabled,
    proxy:
      process.env['HTTPS_PROXY'] ||
      process.env['https_proxy'] ||
      process.env['HTTP_PROXY'] ||
      process.env['http_proxy'],
    cwd,
    fileDiscoveryService: fileService,
    bugCommand: settings.advanced?.bugCommand,
    model: resolvedModel,
    maxSessionTurns: settings.model?.maxSessionTurns,
    experimentalZedIntegration: argv.experimentalAcp || false,
    listExtensions: argv.listExtensions || false,
    listSessions: argv.listSessions || false,
    deleteSession: argv.deleteSession,
    enabledExtensions: argv.extensions,
    extensionLoader: extensionManager,
    enableExtensionReloading: settings.experimental?.extensionReloading,
    enableAgents: settings.experimental?.enableAgents,
    plan: settings.experimental?.plan,
    skillsSupport: settings.experimental?.skills,
    disabledSkills: settings.skills?.disabled,
    experimentalJitContext: settings.experimental?.jitContext,
    noBrowser: !!process.env['NO_BROWSER'],
    summarizeToolOutput: settings.model?.summarizeToolOutput,
    ideMode,
    compressionThreshold: settings.model?.compressionThreshold,
    folderTrust,
    interactive,
    trustedFolder,
    useRipgrep: settings.tools?.useRipgrep,
    enableInteractiveShell: settings.tools?.shell?.enableInteractiveShell,
    shellToolInactivityTimeout: settings.tools?.shell?.inactivityTimeout,
    enableShellOutputEfficiency:
      settings.tools?.shell?.enableShellOutputEfficiency ?? true,
    skipNextSpeakerCheck: settings.model?.skipNextSpeakerCheck,
    enablePromptCompletion: settings.general?.enablePromptCompletion,
    truncateToolOutputThreshold: settings.tools?.truncateToolOutputThreshold,
    truncateToolOutputLines: settings.tools?.truncateToolOutputLines,
    enableToolOutputTruncation: settings.tools?.enableToolOutputTruncation,
    eventEmitter: appEvents,
    useWriteTodos: argv.useWriteTodos ?? settings.useWriteTodos,
    output: {
      format: (argv.outputFormat ?? settings.output?.format) as OutputFormat,
    },
    codebaseInvestigatorSettings:
      settings.experimental?.codebaseInvestigatorSettings,
    cliHelpAgentSettings: settings.experimental?.cliHelpAgentSettings,
    fakeResponses: argv.fakeResponses,
    recordResponses: argv.recordResponses,
    retryFetchErrors: settings.general?.retryFetchErrors,
    ptyInfo: ptyInfo?.name,
    disableLLMCorrection: settings.tools?.disableLLMCorrection,
    modelConfigServiceConfig: settings.modelConfigs,
    // TODO: loading of hooks based on workspace trust
    enableHooks:
      (settings.tools?.enableHooks ?? true) &&
      (settings.hooks?.enabled ?? false),
    enableHooksUI: settings.tools?.enableHooks ?? true,
    hooks: settings.hooks || {},
    projectHooks: projectHooks || {},
    onModelChange: (model: string) => saveModelChange(loadedSettings, model),
    onReload: async () => {
      const refreshedSettings = loadSettings(cwd);
      return {
        disabledSkills: refreshedSettings.merged.skills.disabled,
        agents: refreshedSettings.merged.agents,
      };
    },
  });
}

function mergeExcludeTools(
  settings: MergedSettings,
  extraExcludes: string[] = [],
): string[] {
  const allExcludeTools = new Set([
    ...(settings.tools.exclude || []),
    ...extraExcludes,
  ]);
  return Array.from(allExcludeTools);
}
