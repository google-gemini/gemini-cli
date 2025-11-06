/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionSettings } from './extension-settings.js';

export interface SettingsAllowlist {
  allowed: string[];
  forbidden: string[];
  arrayAppendOnly: string[];
}

export class ExtensionSettingsValidator {
  private readonly allowlist: SettingsAllowlist = {
    allowed: [
      // General settings
      'general.preferredEditor',
      'general.vimMode',
      'general.disableAutoUpdate',
      'general.disableUpdateNag',
      'general.checkpointing.enabled',
      'general.enablePromptCompletion',
      'general.retryFetchErrors',
      'general.debugKeystrokeLogging',
      'general.sessionRetention.enabled',
      'general.sessionRetention.maxAge',
      'general.sessionRetention.maxCount',
      'general.sessionRetention.minRetention',

      // Output settings
      'output.format',

      // UI settings
      'ui.theme',
      'ui.customThemes',
      'ui.hideWindowTitle',
      'ui.showStatusInTitle',
      'ui.hideTips',
      'ui.hideBanner',
      'ui.hideContextSummary',
      'ui.footer.hideCWD',
      'ui.footer.hideSandboxStatus',
      'ui.footer.hideModelInfo',
      'ui.footer.hideContextPercentage',
      'ui.hideFooter',
      'ui.showMemoryUsage',
      'ui.showLineNumbers',
      'ui.showCitations',
      'ui.useFullWidth',
      'ui.useAlternateBuffer',
      'ui.customWittyPhrases',
      'ui.accessibility.disableLoadingPhrases',
      'ui.accessibility.screenReader',

      // IDE settings
      'ide.enabled',
      'ide.hasSeenNudge',

      // Context settings
      'context.fileName',
      'context.importFormat',
      'context.discoveryMaxDirs',
      'context.includeDirectories',
      'context.loadMemoryFromIncludeDirectories',
      'context.fileFiltering.respectGitIgnore',
      'context.fileFiltering.respectGeminiIgnore',
      'context.fileFiltering.enableRecursiveFileSearch',
      'context.fileFiltering.disableFuzzySearch',

      // Tool settings
      'tools.shell.enableInteractiveShell',
      'tools.shell.pager',
      'tools.shell.showColor',
      'tools.autoAccept',
      'tools.core',
      'tools.allowed',
      'tools.exclude',
      'tools.discoveryCommand',
      'tools.callCommand',
      'tools.useRipgrep',
      'tools.enableToolOutputTruncation',
      'tools.truncateToolOutputThreshold',
      'tools.truncateToolOutputLines',
      'tools.enableMessageBusIntegration',
      'tools.enableHooks',

      // Model settings
      'model.name',
      'model.maxSessionTurns',
      'model.summarizeToolOutput',
      'model.compressionThreshold',
      'model.skipNextSpeakerCheck',

      // Model configs
      'modelConfigs.aliases',
      'modelConfigs.overrides',

      // MCP settings
      'mcp.serverCommand',
      'mcp.allowed',
      'mcp.excluded',

      // Top-level feature flags
      'useSmartEdit',
      'useWriteTodos',

      // Advanced settings
      'advanced.autoConfigureMemory',
      'advanced.dnsResolutionOrder',
      'advanced.excludedEnvVars',
      'advanced.bugCommand',

      // Experimental settings
      'experimental.extensionManagement',
      'experimental.extensionReloading',
      'experimental.useModelRouter',
      'experimental.codebaseInvestigatorSettings.enabled',
      'experimental.codebaseInvestigatorSettings.maxNumTurns',
      'experimental.codebaseInvestigatorSettings.maxTimeMinutes',
      'experimental.codebaseInvestigatorSettings.thinkingBudget',
      'experimental.codebaseInvestigatorSettings.model',

      // Hooks - allow any hook configuration
      'hooks',

      // MCP Servers - allow server configs but not trust field
      'mcpServers',
    ],

    forbidden: [
      // Security settings - never allow
      'security',
      'security.auth',
      'security.folderTrust',
      'security.disableYoloMode',

      // Privacy/telemetry - never allow
      'telemetry',
      'privacy',
      'privacy.usageStatisticsEnabled',

      // Dangerous tool settings
      'tools.sandbox', // Don't allow extensions to modify sandbox settings
      'mcpServers.*.trust', // Don't allow extensions to bypass trust confirmation
    ],

    arrayAppendOnly: [
      'context.includeDirectories',
      'context.fileName',
      'tools.exclude',
      'tools.allowed',
      'tools.core',
      'ui.customWittyPhrases',
      'mcp.allowed',
      'mcp.excluded',
      'advanced.excludedEnvVars',
      'modelConfigs.overrides',
    ],
  };

  validate(settings: ExtensionSettings): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    this.validateObject(
      settings as Record<string, unknown>,
      '',
      errors,
      warnings,
    );

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateObject(
    obj: Record<string, unknown>,
    path: string,
    errors: string[],
    warnings: string[],
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (this.isForbidden(currentPath)) {
        errors.push(
          `Setting "${currentPath}" is forbidden for security reasons. ` +
            `Extensions cannot modify authentication, privacy, or security settings.`,
        );
        continue;
      }

      if (!this.isAllowed(currentPath)) {
        errors.push(
          `Setting "${currentPath}" is not in the allowlist. ` +
            `See documentation for allowed settings.`,
        );
        continue;
      }

      if (currentPath === 'tools.autoAccept' && value === true) {
        errors.push(
          `Setting "tools.autoAccept" to true is not allowed for security. ` +
            `Extensions can only set it to false.`,
        );
        continue;
      }

      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value !== null
      ) {
        this.validateObject(
          value as Record<string, unknown>,
          currentPath,
          errors,
          warnings,
        );
      }
    }
  }

  private isForbidden(path: string): boolean {
    return this.allowlist.forbidden.some((forbidden) => {
      if (forbidden.includes('*')) {
        // Handle patterns like "mcpServers.*.trust"
        const pattern = forbidden.replace(/\*/g, '[^.]+');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(path);
      }
      return path === forbidden || path.startsWith(forbidden + '.');
    });
  }

  private isAllowed(path: string): boolean {
    return this.allowlist.allowed.some((allowed) => {
      if (path === allowed) {
        return true; // Exact match
      }
      // Check if this is a parent of an allowed setting
      if (allowed.startsWith(path + '.')) {
        return true;
      }
      // Special handling for paths that allow arbitrary nested keys
      // e.g., "hooks" allows "hooks.beforeTool", "hooks.afterModel", etc.
      // e.g., "mcpServers" allows "mcpServers.myServer", "mcpServers.myServer.command", etc.
      if (allowed === 'hooks' && path.startsWith('hooks.')) {
        return true;
      }
      if (allowed === 'mcpServers' && path.startsWith('mcpServers.')) {
        return true;
      }
      return false;
    });
  }

  isArrayAppendSetting(path: string): boolean {
    return this.allowlist.arrayAppendOnly.includes(path);
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
