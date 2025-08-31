/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolResult,
  ToolCallConfirmationDetails,
  ToolInvocation,
} from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { Config } from '../config/config.js';
import { detectIdeFromEnv, getIdeInfo, DetectedIde } from '../ide/detect-ide.js';
import { getIdeInstaller } from '../ide/ide-installer.js';

export type InstallVSCodeCompanionParams = Record<string, never>;

/**
 * Tool for installing the Gemini CLI VS Code companion extension.
 */
class InstallVSCodeCompanionInvocation extends BaseToolInvocation<
  InstallVSCodeCompanionParams,
  ToolResult
> {
  constructor(_config: Config, params: InstallVSCodeCompanionParams) {
    super(params);
  }

  getDescription(): string {
    return 'Install or update the Gemini CLI IDE companion extension';
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const ide = detectIdeFromEnv();
    const ideName = ide ? getIdeInfo(ide).displayName : 'VS Code family';
    return {
      type: 'info',
      title: 'Install IDE Companion',
      prompt: `This will install the Gemini CLI companion extension for ${ideName}. Do you want to continue?`,
      onConfirm: async () => {},
    };
  }

  async execute(): Promise<ToolResult> {
    const ide = detectIdeFromEnv();
    const target = ide ?? DetectedIde.VSCode;
    const installer = getIdeInstaller(target);
    if (!installer) {
      return {
        llmContent: 'No compatible IDE detected for installation.',
        returnDisplay: '❌ No compatible IDE detected for installation.',
      };
    }
    const result = await installer.install();
    if (result.success) {
      return {
        llmContent: result.message,
        returnDisplay: `✅ ${result.message}`,
      };
    }
    return {
      llmContent: result.message,
      returnDisplay: `❌ ${result.message}`,
    };
  }
}

export class InstallVSCodeCompanionTool extends BaseDeclarativeTool<
  InstallVSCodeCompanionParams,
  ToolResult
> {
  static readonly Name = 'install_vscode_companion';

  constructor(private readonly config: Config) {
    super(
      InstallVSCodeCompanionTool.Name,
      'Install VS Code Companion',
      'Installs or updates the Gemini CLI VS Code companion extension for tighter IDE integration.',
      Kind.Other,
      { type: 'object', properties: {} },
    );
  }

  protected createInvocation(
    params: InstallVSCodeCompanionParams,
  ): ToolInvocation<InstallVSCodeCompanionParams, ToolResult> {
    return new InstallVSCodeCompanionInvocation(this.config, params);
  }
}
