/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { debugLogger } from '../index.js';
import { type SandboxPermissions } from '../services/sandboxManager.js';
import { ToolErrorType } from './tool-error.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolConfirmationOutcome,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type BackgroundExecutionData,
  type ToolCallConfirmationDetails,
  type ToolExecuteConfirmationDetails,
  type PolicyUpdateOptions,
  type ExecuteOptions,
  type ForcedToolDecision,
} from './tools.js';

import { getErrorMessage } from '../utils/errors.js';
import { summarizeToolOutput } from '../utils/summarizer.js';
import {
  ShellExecutionService,
  type ShellOutputEvent,
} from '../services/shellExecutionService.js';
import { formatBytes } from '../utils/formatters.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import {
  getCommandRoots,
  initializeShellParsers,
  stripShellWrapper,
  parseCommandDetails,
  hasRedirection,
  detectCommandSubstitution,
  normalizeCommand,
  escapeShellArg,
} from '../utils/shell-utils.js';
import { SHELL_TOOL_NAME } from './tool-names.js';
import { PARAM_ADDITIONAL_PERMISSIONS } from './definitions/base-declarations.js';
import { ApprovalMode } from '../policy/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getShellDefinition } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { toPathKey, isSubpath, resolveToRealPath } from '../utils/paths.js';
import {
  getProactiveToolSuggestions,
  isNetworkReliantCommand,
} from '../sandbox/utils/proactivePermissions.js';

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;

// Delay so user does not see the output of the process before the process is moved to the background.
const BACKGROUND_DELAY_MS = 200;
const SHOW_NL_DESCRIPTION_THRESHOLD = 150;

export interface ShellToolParams {
  command: string;
  description?: string;
  dir_path?: string;
  is_background?: boolean;
  delay_ms?: number;
  [PARAM_ADDITIONAL_PERMISSIONS]?: SandboxPermissions;
}

export class ShellToolInvocation extends BaseToolInvocation<
  ShellToolParams,
  ToolResult
> {
  private proactivePermissionsConfirmed?: SandboxPermissions;

  constructor(
    private readonly context: AgentLoopContext,
    params: ShellToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  /**
   * Wraps a command in a subshell `()` to capture background process IDs (PIDs) using pgrep.
   * Uses newlines to prevent breaking heredocs or trailing comments.
   *
   * @param command The raw command string to execute.
   * @param tempFilePath Path to the temporary file where PIDs will be written.
   * @param isWindows Whether the current platform is Windows (if true, the command is returned as-is).
   * @returns The wrapped command string.
   */
  private wrapCommandForPgrep(
    command: string,
    tempFilePath: string,
    isWindows: boolean,
  ): string {
    if (isWindows) {
      return command;
    }
    let trimmed = command.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.endsWith('\\')) {
      trimmed += ' ';
    }
    const escapedTempFilePath = escapeShellArg(tempFilePath, 'bash');
    return `(\n${trimmed}\n)\n__code=$?; pgrep -g 0 >${escapedTempFilePath} 2>&1; exit $__code;`;
  }

  private getContextualDetails(): string {
    let details = '';
    // append optional [in directory]
    // note explanation is needed even if validation fails due to absolute path
    if (this.params.dir_path) {
      details += `[in ${this.params.dir_path}]`;
    } else {
      details += `[current working directory ${process.cwd()}]`;
    }
    // append optional (description), replacing any line breaks with spaces
    if (this.params.description) {
      details += ` (${this.params.description.replace(/\n/g, ' ')})`;
    }
    if (this.params.is_background) {
      details += ' [background]';
    }
    return details;
  }

  getDescription(): string {
    const descStr = this.params.description?.trim();
    const commandStr = this.params.command;
    return Array.from(commandStr).length <= SHOW_NL_DESCRIPTION_THRESHOLD ||
      !descStr
      ? commandStr
      : descStr;
  }

  private simplifyPaths(paths: Set<string>): string[] {
    if (paths.size === 0) return [];
    const rawPaths = Array.from(paths);

    // 1. Remove redundant paths (subpaths of already included paths)
    const sorted = rawPaths.sort((a, b) => a.length - b.length);
    const nonRedundant: string[] = [];
    for (const p of sorted) {
      if (!nonRedundant.some((s) => isSubpath(s, p))) {
        nonRedundant.push(p);
      }
    }

    // 2. Consolidate clusters: if >= 3 paths share the same immediate parent, use the parent
    const parentCounts = new Map<string, string[]>();
    for (const p of nonRedundant) {
      const parent = path.dirname(p);
      if (!parentCounts.has(parent)) {
        parentCounts.set(parent, []);
      }
      parentCounts.get(parent)!.push(p);
    }

    const finalPaths = new Set<string>();

    const sensitiveDirs = new Set([
      os.homedir(),
      path.dirname(os.homedir()),
      path.sep,
      path.join(path.sep, 'etc'),
      path.join(path.sep, 'usr'),
      path.join(path.sep, 'var'),
      path.join(path.sep, 'bin'),
      path.join(path.sep, 'sbin'),
      path.join(path.sep, 'lib'),
      path.join(path.sep, 'root'),
      path.join(path.sep, 'home'),
      path.join(path.sep, 'Users'),
    ]);

    if (os.platform() === 'win32') {
      const systemRoot = process.env['SystemRoot'];
      if (systemRoot) {
        sensitiveDirs.add(systemRoot);
        sensitiveDirs.add(path.join(systemRoot, 'System32'));
      }
      const programFiles = process.env['ProgramFiles'];
      if (programFiles) sensitiveDirs.add(programFiles);
      const programFilesX86 = process.env['ProgramFiles(x86)'];
      if (programFilesX86) sensitiveDirs.add(programFilesX86);
    }

    for (const [parent, children] of parentCounts.entries()) {
      const isSensitive = sensitiveDirs.has(parent);
      if (children.length >= 3 && parent.length > 1 && !isSensitive) {
        finalPaths.add(parent);
      } else {
        for (const child of children) {
          finalPaths.add(child);
        }
      }
    }

    // 3. Final redundancy check after consolidation
    const finalSorted = Array.from(finalPaths).sort(
      (a, b) => a.length - b.length,
    );
    const result: string[] = [];
    for (const p of finalSorted) {
      if (!result.some((s) => isSubpath(s, p))) {
        result.push(p);
      }
    }

    return result;
  }

  override getDisplayTitle(): string {
    return this.params.command;
  }

  override getExplanation(): string {
    return this.getContextualDetails().trim();
  }

  override getPolicyUpdateOptions(
    outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined {
    if (
      outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave ||
      outcome === ToolConfirmationOutcome.ProceedAlways
    ) {
      const command = stripShellWrapper(this.params.command);
      const rootCommands = [...new Set(getCommandRoots(command))];
      const allowRedirection = hasRedirection(command) ? true : undefined;

      if (rootCommands.length > 0) {
        return { commandPrefix: rootCommands, allowRedirection };
      }
      return { commandPrefix: this.params.command, allowRedirection };
    }
    return undefined;
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
    forcedDecision?: ForcedToolDecision,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.context.config.getApprovalMode() === ApprovalMode.YOLO) {
      return super.shouldConfirmExecute(abortSignal, forcedDecision);
    }

    if (this.params[PARAM_ADDITIONAL_PERMISSIONS]) {
      return this.getConfirmationDetails(abortSignal);
    }

    if (this.context.config.getSandboxEnabled()) {
      const command = stripShellWrapper(this.params.command);
      const rootCommands = getCommandRoots(command);
      const rawRootCommand = rootCommands[0];

      if (rawRootCommand) {
        const rootCommand = normalizeCommand(rawRootCommand);
        const proactive = await getProactiveToolSuggestions(rootCommand);
        if (proactive) {
          const mode = this.context.config.getApprovalMode();
          const modeConfig =
            this.context.config.sandboxPolicyManager.getModeConfig(mode);
          const approved =
            this.context.config.sandboxPolicyManager.getCommandPermissions(
              rootCommand,
            );

          const hasNetwork = modeConfig.network || approved.network;
          const missingNetwork = !!proactive.network && !hasNetwork;

          // Detect commands or sub-commands that definitely need network
          const parsed = parseCommandDetails(command);
          const subCommand = parsed?.details[0]?.args?.[0];
          const needsNetwork = isNetworkReliantCommand(rootCommand, subCommand);

          if (needsNetwork) {
            // Add write permission to the current directory if we are in readonly mode
            const isReadonlyMode = modeConfig.readonly ?? false;

            if (isReadonlyMode) {
              const cwd =
                this.params.dir_path || this.context.config.getTargetDir();
              proactive.fileSystem = proactive.fileSystem || {
                read: [],
                write: [],
              };
              proactive.fileSystem.write = proactive.fileSystem.write || [];
              if (!proactive.fileSystem.write.includes(cwd)) {
                proactive.fileSystem.write.push(cwd);
                proactive.fileSystem.read = proactive.fileSystem.read || [];
                if (!proactive.fileSystem.read.includes(cwd)) {
                  proactive.fileSystem.read.push(cwd);
                }
              }
            }

            const isApproved = (
              requestedPath: string,
              approvedPaths?: string[],
            ): boolean => {
              if (!approvedPaths || approvedPaths.length === 0) return false;
              const requestedRealIdentity = toPathKey(
                resolveToRealPath(requestedPath),
              );

              // Identity check is fast, subpath check is slower
              return approvedPaths.some((p) => {
                const approvedRealIdentity = toPathKey(resolveToRealPath(p));
                return (
                  requestedRealIdentity === approvedRealIdentity ||
                  isSubpath(approvedRealIdentity, requestedRealIdentity)
                );
              });
            };

            const missingRead = (proactive.fileSystem?.read || []).filter(
              (p) => !isApproved(p, approved.fileSystem?.read),
            );
            const missingWrite = (proactive.fileSystem?.write || []).filter(
              (p) => !isApproved(p, approved.fileSystem?.write),
            );

            const needsExpansion =
              missingRead.length > 0 ||
              missingWrite.length > 0 ||
              missingNetwork;

            if (needsExpansion) {
              const details = await this.getConfirmationDetails(
                abortSignal,
                proactive,
              );
              if (details && details.type === 'sandbox_expansion') {
                const originalOnConfirm = details.onConfirm;
                details.onConfirm = async (
                  outcome: ToolConfirmationOutcome,
                ) => {
                  await originalOnConfirm(outcome);
                  if (outcome !== ToolConfirmationOutcome.Cancel) {
                    this.proactivePermissionsConfirmed = proactive;
                  }
                };
              }
              return details;
            }
          }
        }
      }
    }

    return super.shouldConfirmExecute(abortSignal, forcedDecision);
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
    proactivePermissions?: SandboxPermissions,
  ): Promise<ToolCallConfirmationDetails | false> {
    const command = stripShellWrapper(this.params.command);

    const parsed = parseCommandDetails(command);
    let rootCommandDisplay = '';

    if (!parsed || parsed.hasError || parsed.details.length === 0) {
      // Fallback if parser fails
      const fallback = command.trim().split(/\s+/)[0];
      rootCommandDisplay = fallback || 'shell command';
      if (hasRedirection(command)) {
        rootCommandDisplay += ', redirection';
      }
    } else {
      rootCommandDisplay = parsed.details
        .map((detail) => detail.name)
        .join(', ');
    }

    const rootCommands = [...new Set(getCommandRoots(command))];
    const rootCommand = rootCommands[0] || 'shell';

    // Proactively suggest expansion for known network-heavy tools (npm install, etc.)
    // to avoid hangs when network is restricted by default.
    const effectiveAdditionalPermissions =
      this.params[PARAM_ADDITIONAL_PERMISSIONS] || proactivePermissions;

    // Rely entirely on PolicyEngine for interactive confirmation.
    // If we are here, it means PolicyEngine returned ASK_USER (or no message bus),
    // so we must provide confirmation details.
    // If additional_permissions are provided, it's an expansion request
    if (effectiveAdditionalPermissions) {
      return {
        type: 'sandbox_expansion',
        title: proactivePermissions
          ? 'Sandbox Expansion Request (Recommended)'
          : 'Sandbox Expansion Request',
        command: this.params.command,
        rootCommand: rootCommandDisplay,
        additionalPermissions: effectiveAdditionalPermissions,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave) {
            this.context.config.sandboxPolicyManager.addPersistentApproval(
              rootCommand,
              effectiveAdditionalPermissions,
            );
          } else if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.context.config.sandboxPolicyManager.addSessionApproval(
              rootCommand,
              effectiveAdditionalPermissions,
            );
          }
        },
      };
    }

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: this.params.command,
      rootCommand: rootCommandDisplay,
      rootCommands,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // Policy updates are now handled centrally by the scheduler
      },
    };
    return confirmationDetails;
  }

  async execute(options: ExecuteOptions): Promise<ToolResult> {
    const {
      abortSignal: signal,
      updateOutput,
      shellExecutionConfig,
      setExecutionIdCallback,
    } = options;
    const strippedCommand = stripShellWrapper(this.params.command);

    if (detectCommandSubstitution(strippedCommand)) {
      return {
        llmContent:
          'Command injection detected: command substitution syntax ' +
          '($(), backticks, <() or >()) found in command arguments. ' +
          'On PowerShell, @() array subexpressions and $() subexpressions are also blocked. ' +
          'This is a security risk and the command was blocked.',
        returnDisplay:
          'Blocked: command substitution detected in shell command.',
      };
    }

    if (signal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    const isWindows = os.platform() === 'win32';
    let tempFilePath = '';
    let tempDir = '';

    const timeoutMs = this.context.config.getShellToolInactivityTimeout();
    const timeoutController = new AbortController();
    let timeoutTimer: NodeJS.Timeout | undefined;

    // Handle signal combination manually to avoid TS issues or runtime missing features
    const combinedController = new AbortController();

    const onAbort = () => combinedController.abort();
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-shell-'));
      tempFilePath = path.join(tempDir, 'pgrep.tmp');

      // pgrep is not available on Windows, so we can't get background PIDs
      const commandToExecute = this.wrapCommandForPgrep(
        strippedCommand,
        tempFilePath,
        isWindows,
      );

      const cwd = this.params.dir_path
        ? path.resolve(this.context.config.getTargetDir(), this.params.dir_path)
        : this.context.config.getTargetDir();

      const validationError = this.context.config.validatePathAccess(cwd);
      if (validationError) {
        return {
          llmContent: validationError,
          returnDisplay: 'Path not in workspace.',
          error: {
            message: validationError,
            type: ToolErrorType.PATH_NOT_IN_WORKSPACE,
          },
        };
      }
      let cumulativeOutput: string | AnsiOutput = '';
      let lastUpdateTime = Date.now();
      let isBinaryStream = false;

      const resetTimeout = () => {
        if (timeoutMs <= 0) {
          return;
        }
        if (timeoutTimer) clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(() => {
          timeoutController.abort();
        }, timeoutMs);
      };

      signal.addEventListener('abort', onAbort, { once: true });
      timeoutController.signal.addEventListener('abort', onAbort, {
        once: true,
      });

      // Start timeout
      resetTimeout();

      const { result: resultPromise, pid } =
        await ShellExecutionService.execute(
          commandToExecute,
          cwd,
          (event: ShellOutputEvent) => {
            resetTimeout(); // Reset timeout on any event
            if (!updateOutput) {
              return;
            }

            let shouldUpdate = false;

            switch (event.type) {
              case 'data':
                if (isBinaryStream) break;
                cumulativeOutput = event.chunk;
                shouldUpdate = true;
                break;
              case 'binary_detected':
                isBinaryStream = true;
                cumulativeOutput =
                  '[Binary output detected. Halting stream...]';
                shouldUpdate = true;
                break;
              case 'binary_progress':
                isBinaryStream = true;
                cumulativeOutput = `[Receiving binary output... ${formatBytes(
                  event.bytesReceived,
                )} received]`;
                if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
                  shouldUpdate = true;
                }
                break;
              case 'exit':
                break;
              default: {
                throw new Error('An unhandled ShellOutputEvent was found.');
              }
            }

            if (shouldUpdate && !this.params.is_background) {
              updateOutput(cumulativeOutput);
              lastUpdateTime = Date.now();
            }
          },
          combinedController.signal,
          this.context.config.getEnableInteractiveShell(),
          {
            ...shellExecutionConfig,
            sessionId: this.context.config?.getSessionId?.() ?? 'default',
            pager: 'cat',
            sanitizationConfig:
              shellExecutionConfig?.sanitizationConfig ??
              this.context.config.sanitizationConfig,
            sandboxManager: this.context.config.sandboxManager,
            additionalPermissions: {
              network:
                this.params[PARAM_ADDITIONAL_PERMISSIONS]?.network ||
                this.proactivePermissionsConfirmed?.network,
              fileSystem: {
                read: [
                  ...(this.params[PARAM_ADDITIONAL_PERMISSIONS]?.fileSystem
                    ?.read || []),
                  ...(this.proactivePermissionsConfirmed?.fileSystem?.read ||
                    []),
                ],
                write: [
                  ...(this.params[PARAM_ADDITIONAL_PERMISSIONS]?.fileSystem
                    ?.write || []),
                  ...(this.proactivePermissionsConfirmed?.fileSystem?.write ||
                    []),
                ],
              },
            },
            backgroundCompletionBehavior:
              this.context.config.getShellBackgroundCompletionBehavior(),
            originalCommand: strippedCommand,
            enableWindowsBash: this.context.config.getEnableWindowsBash(),
          },
        );

      if (pid) {
        if (setExecutionIdCallback) {
          setExecutionIdCallback(pid);
        }

        // If the model requested to run in the background, do so after a short delay.
        let completed = false;
        if (this.params.is_background) {
          resultPromise
            .then(() => {
              completed = true;
            })
            .catch(() => {
              completed = true; // Also mark completed if it failed
            });

          const sessionId = this.context.config?.getSessionId?.() ?? 'default';
          const delay = this.params.delay_ms ?? BACKGROUND_DELAY_MS;
          setTimeout(() => {
            ShellExecutionService.background(pid, sessionId, strippedCommand);
          }, delay);

          // Wait for the delay amount to see if command returns quickly
          await new Promise((resolve) => setTimeout(resolve, delay));

          if (!completed) {
            // Return early with initial output if still running
            return {
              llmContent: `Command is running in background. PID: ${pid}. Initial output:\n${cumulativeOutput}`,
              returnDisplay: `Background process started with PID ${pid}.`,
            };
          }
        }
      }

      const result = await resultPromise;

      const backgroundPIDs: number[] = [];
      if (os.platform() !== 'win32') {
        let tempFileExists = false;
        try {
          await fsPromises.access(tempFilePath);
          tempFileExists = true;
        } catch {
          tempFileExists = false;
        }

        if (tempFileExists) {
          const pgrepContent = await fsPromises.readFile(tempFilePath, 'utf8');
          const pgrepLines = pgrepContent
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
          for (const line of pgrepLines) {
            if (!/^\d+$/.test(line)) {
              if (
                line.includes('sysmond service not found') ||
                line.includes('Cannot get process list') ||
                line.includes('sysmon request failed')
              ) {
                continue;
              }
              debugLogger.error(`pgrep: ${line}`);
            }
            const pid = Number(line);
            if (pid !== result.pid) {
              backgroundPIDs.push(pid);
            }
          }
        } else {
          if (!signal.aborted && !result.backgrounded) {
            debugLogger.error('missing pgrep output');
          }
        }
      }

      let data: BackgroundExecutionData | undefined;

      let llmContent = '';
      let timeoutMessage = '';
      if (result.aborted) {
        if (timeoutController.signal.aborted) {
          timeoutMessage = `Command was automatically cancelled because it exceeded the timeout of ${(
            timeoutMs / 60000
          ).toFixed(1)} minutes without output.`;
          llmContent = timeoutMessage;
        } else {
          llmContent =
            'Command was cancelled by user before it could complete.';
        }
        if (result.output.trim()) {
          llmContent += ` Below is the output before it was cancelled:\n${result.output}`;
        } else {
          llmContent += ' There was no output before it was cancelled.';
        }
      } else if (this.params.is_background || result.backgrounded) {
        llmContent = `Command moved to background (PID: ${result.pid}). Output hidden. Press Ctrl+B to view.`;
        data = {
          pid: result.pid,
          command: this.params.command,
          initialOutput: result.output,
        };
      } else {
        // Create a formatted error string for display, replacing the wrapper command
        // with the user-facing command.
        const llmContentParts = [`Output: ${result.output || '(empty)'}`];

        if (result.error) {
          const finalError = result.error.message.replaceAll(
            commandToExecute,
            this.params.command,
          );
          llmContentParts.push(`Error: ${finalError}`);
        }

        if (result.exitCode !== null && result.exitCode !== 0) {
          llmContentParts.push(`Exit Code: ${result.exitCode}`);
          data = {
            exitCode: result.exitCode,
            isError: true,
          };
        }

        if (result.signal) {
          llmContentParts.push(`Signal: ${result.signal}`);
        }
        if (backgroundPIDs.length) {
          llmContentParts.push(`Background PIDs: ${backgroundPIDs.join(', ')}`);
        }
        if (result.pid) {
          llmContentParts.push(`Process Group PGID: ${result.pid}`);
        }

        llmContent = llmContentParts.join('\n');
      }

      let returnDisplay: string | AnsiOutput = '';
      if (this.context.config.getDebugMode()) {
        returnDisplay = llmContent;
      } else {
        if (this.params.is_background || result.backgrounded) {
          returnDisplay = `Command moved to background (PID: ${result.pid}). Output hidden. Press Ctrl+B to view.`;
        } else if (result.aborted) {
          const cancelMsg = timeoutMessage || 'Command cancelled by user.';
          if (result.output.trim()) {
            returnDisplay = `${cancelMsg}\n\nOutput before cancellation:\n${result.output}`;
          } else {
            returnDisplay = cancelMsg;
          }
        } else if (result.output.trim() || result.ansiOutput) {
          returnDisplay =
            result.ansiOutput && result.ansiOutput.length > 0
              ? result.ansiOutput
              : result.output;
        } else {
          if (result.signal) {
            returnDisplay = `Command terminated by signal: ${result.signal}`;
          } else if (result.error) {
            returnDisplay = `Command failed: ${getErrorMessage(result.error)}`;
          } else if (result.exitCode !== null && result.exitCode !== 0) {
            returnDisplay = `Command exited with code: ${result.exitCode}`;
          }
          // If output is empty and command succeeded (code 0, no error/signal/abort),
          // returnDisplay will remain empty, which is fine.
        }
      }

      // Heuristic Sandbox Denial Detection
      if (
        !!result.error ||
        !!result.signal ||
        (result.exitCode !== undefined && result.exitCode !== 0) ||
        result.aborted
      ) {
        const sandboxDenial =
          this.context.config.sandboxManager.parseDenials(result);
        if (sandboxDenial) {
          const strippedCommand = stripShellWrapper(this.params.command);
          const rootCommands = getCommandRoots(strippedCommand).filter(
            (r) => r !== 'shopt',
          );
          const rootCommandDisplay =
            rootCommands.length > 0 ? rootCommands[0] : 'shell';

          const readPaths = new Set(
            this.params[PARAM_ADDITIONAL_PERMISSIONS]?.fileSystem?.read || [],
          );
          const writePaths = new Set(
            this.params[PARAM_ADDITIONAL_PERMISSIONS]?.fileSystem?.write || [],
          );

          // Proactive permission suggestions for Node ecosystem tools
          if (this.context.config.getSandboxEnabled()) {
            const proactive =
              await getProactiveToolSuggestions(rootCommandDisplay);
            if (proactive) {
              if (proactive.network) {
                sandboxDenial.network = true;
              }
              if (proactive.fileSystem?.read) {
                for (const p of proactive.fileSystem.read) {
                  readPaths.add(p);
                }
              }
              if (proactive.fileSystem?.write) {
                for (const p of proactive.fileSystem.write) {
                  writePaths.add(p);
                }
              }
            }
          }

          if (sandboxDenial.filePaths) {
            for (const p of sandboxDenial.filePaths) {
              try {
                // Find an existing parent directory to add instead of a non-existent file
                let currentPath = p;
                if (currentPath.startsWith('~')) {
                  currentPath = path.join(os.homedir(), currentPath.slice(1));
                }
                try {
                  if (
                    fs.existsSync(currentPath) &&
                    fs.statSync(currentPath).isFile()
                  ) {
                    currentPath = path.dirname(currentPath);
                  }
                } catch {
                  /* ignore */
                }
                while (currentPath.length > 1) {
                  if (fs.existsSync(currentPath)) {
                    const mode = this.context.config.getApprovalMode();
                    const isReadonlyMode =
                      this.context.config.sandboxPolicyManager.getModeConfig(
                        mode,
                      )?.readonly ?? false;
                    const isAllowed =
                      this.context.config.isPathAllowed(currentPath);

                    if (!isAllowed || isReadonlyMode) {
                      writePaths.add(currentPath);
                      readPaths.add(currentPath);
                    }
                    break;
                  }
                  currentPath = path.dirname(currentPath);
                }
              } catch {
                // ignore
              }
            }
          }

          const simplifiedRead = this.simplifyPaths(readPaths);
          const simplifiedWrite = this.simplifyPaths(writePaths);

          const additionalPermissions = {
            network:
              sandboxDenial.network ||
              this.params[PARAM_ADDITIONAL_PERMISSIONS]?.network ||
              undefined,
            fileSystem:
              simplifiedRead.length > 0 || simplifiedWrite.length > 0
                ? {
                    read: simplifiedRead,
                    write: simplifiedWrite,
                  }
                : undefined,
          };

          const originalReadSize =
            this.params[PARAM_ADDITIONAL_PERMISSIONS]?.fileSystem?.read
              ?.length || 0;
          const originalWriteSize =
            this.params[PARAM_ADDITIONAL_PERMISSIONS]?.fileSystem?.write
              ?.length || 0;
          const originalNetwork =
            !!this.params[PARAM_ADDITIONAL_PERMISSIONS]?.network;

          const newReadSize =
            additionalPermissions.fileSystem?.read?.length || 0;
          const newWriteSize =
            additionalPermissions.fileSystem?.write?.length || 0;
          const newNetwork = !!additionalPermissions.network;

          const hasNewPermissions =
            newReadSize > originalReadSize ||
            newWriteSize > originalWriteSize ||
            (!originalNetwork && newNetwork);

          if (hasNewPermissions) {
            const confirmationDetails = {
              type: 'sandbox_expansion',
              title: 'Sandbox Expansion Request',
              command: this.params.command,
              rootCommand: rootCommandDisplay,
              additionalPermissions,
            };

            return {
              llmContent: 'Sandbox expansion required',
              returnDisplay,
              error: {
                type: ToolErrorType.SANDBOX_EXPANSION_REQUIRED,
                message: JSON.stringify(confirmationDetails),
              },
            };
          }
          // If no new permissions were found by heuristic, do not intercept.
          // Just return the normal execution error so the LLM can try providing explicit paths itself.
        }
      }

      const summarizeConfig =
        this.context.config.getSummarizeToolOutputConfig();
      const executionError = result.error
        ? {
            error: {
              message: result.error.message,
              type: ToolErrorType.SHELL_EXECUTE_ERROR,
            },
          }
        : {};
      if (summarizeConfig && summarizeConfig[SHELL_TOOL_NAME]) {
        const summary = await summarizeToolOutput(
          this.context.config,
          { model: 'summarizer-shell' },
          llmContent,
          this.context.geminiClient,
          signal,
        );
        return {
          llmContent: summary,
          returnDisplay,
          ...executionError,
        };
      }

      return {
        llmContent,
        returnDisplay,
        data,
        ...executionError,
      };
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      signal.removeEventListener('abort', onAbort);
      timeoutController.signal.removeEventListener('abort', onAbort);
      if (tempFilePath) {
        try {
          await fsPromises.unlink(tempFilePath);
        } catch {
          // Ignore errors during unlink
        }
      }
      if (tempDir) {
        try {
          await fsPromises.rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore errors during rm
        }
      }
    }
  }
}

export class ShellTool extends BaseDeclarativeTool<
  ShellToolParams,
  ToolResult
> {
  static readonly Name = SHELL_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    void initializeShellParsers().catch(() => {
      // Errors are surfaced when parsing commands.
    });
    const definition = getShellDefinition(
      context.config.getEnableInteractiveShell(),
      context.config.getEnableShellOutputEfficiency(),
      context.config.getSandboxEnabled(),
      context.config.getEnableWindowsBash(),
    );
    super(
      ShellTool.Name,
      'Shell',
      definition.base.description!,
      Kind.Execute,
      definition.base.parametersJsonSchema,
      messageBus,
      false, // output is not markdown
      true, // output can be updated
    );
  }

  protected override validateToolParamValues(
    params: ShellToolParams,
  ): string | null {
    if (!params.command.trim()) {
      return 'Command cannot be empty.';
    }

    if (params.dir_path) {
      const resolvedPath = path.resolve(
        this.context.config.getTargetDir(),
        params.dir_path,
      );
      return this.context.config.validatePathAccess(resolvedPath);
    }
    return null;
  }

  protected createInvocation(
    params: ShellToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ShellToolParams, ToolResult> {
    return new ShellToolInvocation(
      this.context,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    const definition = getShellDefinition(
      this.context.config.getEnableInteractiveShell(),
      this.context.config.getEnableShellOutputEfficiency(),
      this.context.config.getSandboxEnabled(),
      this.context.config.getEnableWindowsBash(),
    );
    return resolveToolDeclaration(definition, modelId);
  }
}
