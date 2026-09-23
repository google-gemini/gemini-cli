/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

import {
  type MCPServerConfig,
  debugLogger,
  GEMINI_DIR,
  getErrorMessage,
  type TelemetrySettings,
  homedir,
  checkPathTrust,
  isHeadlessMode,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';

export const USER_SETTINGS_DIR = path.join(homedir(), GEMINI_DIR);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

export enum MergeStrategy {
  REPLACE = 'replace',
  CONCAT = 'concat',
  UNION = 'union',
  SHALLOW_MERGE = 'shallow_merge',
}

export type Mergeable =
  | string
  | number
  | boolean
  | null
  | undefined
  | object
  | Mergeable[];

export type MergeableObject = Record<string, Mergeable>;

export interface CheckpointingSettings {
  enabled?: boolean;
}

export interface FileFilteringSettings {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
  enableRecursiveFileSearch?: boolean;
  enableFuzzySearch?: boolean;
  customIgnoreFilePaths?: string[];
}

export interface LoggingSettings {
  level?: string;
}

export interface Settings {
  mcpServers?: Record<string, MCPServerConfig>;
  mcp?: {
    serverCommand?: string;
    allowed?: string[];
    excluded?: string[];
  };
  tools?: {
    allowed?: string[];
    exclude?: string[];
    core?: string[];
    autoAccept?: boolean;
    sandbox?: boolean | string | Record<string, unknown>;
    enableHooks?: boolean;
    discoveryCommand?: string;
    callCommand?: string;
    useRipgrep?: boolean;
    shell?: {
      enableInteractiveShell?: boolean;
      pager?: string;
      showColor?: boolean;
      inactivityTimeout?: number;
    };
  };
  telemetry?: TelemetrySettings;
  logging?: LoggingSettings;
  ui?: {
    theme?: string;
    showMemoryUsage?: boolean;
    showLineNumbers?: boolean;
    showCitations?: boolean;
    showStatusInTitle?: boolean;
    hideWindowTitle?: boolean;
    hideTips?: boolean;
    hideBanner?: boolean;
    hideFooter?: boolean;
    hideContextSummary?: boolean;
    loadingPhrases?: string;
    customThemes?: Record<string, unknown>;
    customWittyPhrases?: string[];
    footer?: {
      hideCWD?: boolean;
      hideSandboxStatus?: boolean;
      hideModelInfo?: boolean;
    };
    accessibility?: {
      enableLoadingPhrases?: boolean;
      screenReader?: boolean;
    };
  };
  general?: {
    previewFeatures?: boolean;
    vimMode?: boolean;
    preferredEditor?: string;
    checkpointing?: CheckpointingSettings;
    enableAutoUpdate?: boolean;
    enableAutoUpdateNotification?: boolean;
    defaultApprovalMode?: string;
    debugKeystrokeLogging?: boolean;
    enablePromptCompletion?: boolean;
    retryFetchErrors?: boolean;
    plan?: {
      enabled?: boolean;
    };
  };
  context?: {
    fileName?: string | string[];
    includeDirectories?: string[];
    loadFromIncludeDirectories?: boolean;
    importFormat?: string;
    discoveryMaxDirs?: number;
    fileFiltering?: FileFilteringSettings;
  };
  security?: {
    folderTrust?: {
      enabled?: boolean;
      featureEnabled?: boolean;
    };
    auth?: {
      selectedType?: string;
      enforcedType?: string;
      useExternal?: boolean;
    };
  };
  model?: {
    name?: string;
    maxSessionTurns?: number;
    compressionThreshold?: number;
    skipNextSpeakerCheck?: boolean;
    summarizeToolOutput?: Record<string, unknown>;
  };
  ide?: {
    enabled?: boolean;
    hasSeenNudge?: boolean;
  };
  privacy?: {
    usageStatisticsEnabled?: boolean;
  };
  advanced?: {
    autoConfigureMemory?: boolean;
    bugCommand?: Record<string, unknown>;
    dnsResolutionOrder?: string;
    excludedEnvVars?: string[];
    ignoreLocalEnv?: boolean;
  };
  experimental?: {
    enableAgents?: boolean;
    skills?: boolean;
    extensionManagement?: boolean;
    worktrees?: boolean;
  };
  extensions?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  policyPaths?: string[];
  adminPolicyPaths?: string[];
}

export interface SettingsError {
  message: string;
  path: string;
}

const MIGRATION_MAP: Record<string, string> = {
  accessibility: 'ui.accessibility',
  allowedTools: 'tools.allowed',
  allowMCPServers: 'mcp.allowed',
  autoAccept: 'tools.autoAccept',
  autoConfigureMaxOldSpaceSize: 'advanced.autoConfigureMemory',
  bugCommand: 'advanced.bugCommand',
  chatCompression: 'model.compressionThreshold',
  checkpointing: 'general.checkpointing',
  coreTools: 'tools.core',
  contextFileName: 'context.fileName',
  customThemes: 'ui.customThemes',
  customWittyPhrases: 'ui.customWittyPhrases',
  debugKeystrokeLogging: 'general.debugKeystrokeLogging',
  disableAutoUpdate: 'general.disableAutoUpdate',
  disableUpdateNag: 'general.disableUpdateNag',
  dnsResolutionOrder: 'advanced.dnsResolutionOrder',
  enableHooks: 'tools.enableHooks',
  enablePromptCompletion: 'general.enablePromptCompletion',
  enforcedAuthType: 'security.auth.enforcedType',
  excludeTools: 'tools.exclude',
  excludeMCPServers: 'mcp.excluded',
  excludedProjectEnvVars: 'advanced.excludedEnvVars',
  experimentalSkills: 'experimental.skills',
  extensionManagement: 'experimental.extensionManagement',
  extensions: 'extensions',
  fileFiltering: 'context.fileFiltering',
  folderTrustFeature: 'security.folderTrust.featureEnabled',
  folderTrust: 'security.folderTrust.enabled',
  hasSeenIdeIntegrationNudge: 'ide.hasSeenNudge',
  hideWindowTitle: 'ui.hideWindowTitle',
  showStatusInTitle: 'ui.showStatusInTitle',
  hideTips: 'ui.hideTips',
  hideBanner: 'ui.hideBanner',
  hideFooter: 'ui.hideFooter',
  hideCWD: 'ui.footer.hideCWD',
  hideSandboxStatus: 'ui.footer.hideSandboxStatus',
  hideModelInfo: 'ui.footer.hideModelInfo',
  hideContextSummary: 'ui.hideContextSummary',
  showMemoryUsage: 'ui.showMemoryUsage',
  showLineNumbers: 'ui.showLineNumbers',
  showCitations: 'ui.showCitations',
  ideMode: 'ide.enabled',
  includeDirectories: 'context.includeDirectories',
  loadMemoryFromIncludeDirectories: 'context.loadFromIncludeDirectories',
  logLevel: 'logging.level',
  maxSessionTurns: 'model.maxSessionTurns',
  mcpServers: 'mcpServers',
  mcpServerCommand: 'mcp.serverCommand',
  memoryImportFormat: 'context.importFormat',
  memoryDiscoveryMaxDirs: 'context.discoveryMaxDirs',
  model: 'model.name',
  preferredEditor: 'general.preferredEditor',
  retryFetchErrors: 'general.retryFetchErrors',
  sandbox: 'tools.sandbox',
  selectedAuthType: 'security.auth.selectedType',
  enableInteractiveShell: 'tools.shell.enableInteractiveShell',
  shellPager: 'tools.shell.pager',
  shellShowColor: 'tools.shell.showColor',
  shellInactivityTimeout: 'tools.shell.inactivityTimeout',
  skipNextSpeakerCheck: 'model.skipNextSpeakerCheck',
  summarizeToolOutput: 'model.summarizeToolOutput',
  telemetry: 'telemetry',
  theme: 'ui.theme',
  toolDiscoveryCommand: 'tools.discoveryCommand',
  toolCallCommand: 'tools.callCommand',
  usageStatisticsEnabled: 'privacy.usageStatisticsEnabled',
  useExternalAuth: 'security.auth.useExternal',
  useRipgrep: 'tools.useRipgrep',
  vimMode: 'general.vimMode',
};

const KNOWN_V2_CONTAINERS = new Set(
  Object.values(MIGRATION_MAP).map((p) => p.split('.')[0]),
);

const LEGACY_V1_ONLY_KEYS = new Set([
  ...Object.keys(MIGRATION_MAP).filter(
    (k) => k !== MIGRATION_MAP[k] && !KNOWN_V2_CONTAINERS.has(k),
  ),
  'telemetryDisabled',
]);

const MERGE_STRATEGIES: Record<string, MergeStrategy> = {
  mcpServers: MergeStrategy.SHALLOW_MERGE,
  policyPaths: MergeStrategy.UNION,
  adminPolicyPaths: MergeStrategy.UNION,
};

export function getMergeStrategyForPath(
  pathSegments: string[],
): MergeStrategy | undefined {
  return MERGE_STRATEGIES[pathSegments.join('.')];
}

function isPlainObject(item: unknown): item is MergeableObject {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(item);
  return proto === null || proto === Object.prototype;
}

function isUnsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

function mergeRecursively(
  target: MergeableObject,
  source: MergeableObject,
  getStrategy: (path: string[]) => MergeStrategy | undefined,
  currentPath: string[] = [],
): MergeableObject {
  for (const key of Object.keys(source)) {
    if (isUnsafeKey(key)) {
      continue;
    }
    const srcValue = source[key];
    if (srcValue === undefined) {
      continue;
    }
    const newPath = [...currentPath, key];
    const objValue = target[key];
    const mergeStrategy = getStrategy(newPath);

    if (mergeStrategy === MergeStrategy.SHALLOW_MERGE && objValue && srcValue) {
      const obj1 = isPlainObject(objValue) ? objValue : {};
      const obj2 = isPlainObject(srcValue) ? srcValue : {};
      const mergedShallow: MergeableObject = {};
      for (const [k, v] of Object.entries(obj1)) {
        if (!isUnsafeKey(k)) mergedShallow[k] = v;
      }
      for (const [k, v] of Object.entries(obj2)) {
        if (!isUnsafeKey(k)) mergedShallow[k] = v;
      }
      target[key] = mergedShallow;
      continue;
    }

    if (Array.isArray(objValue)) {
      const srcArray = Array.isArray(srcValue) ? srcValue : [srcValue];
      if (mergeStrategy === MergeStrategy.CONCAT) {
        target[key] = objValue.concat(srcArray);
        continue;
      }
      if (mergeStrategy === MergeStrategy.UNION) {
        target[key] = [...new Set(objValue.concat(srcArray))];
        continue;
      }
    }

    if (isPlainObject(objValue) && isPlainObject(srcValue)) {
      mergeRecursively(objValue, srcValue, getStrategy, newPath);
    } else if (isPlainObject(srcValue)) {
      const nestedTarget: MergeableObject = {};
      target[key] = nestedTarget;
      mergeRecursively(nestedTarget, srcValue, getStrategy, newPath);
    } else {
      target[key] = srcValue;
    }
  }
  return target;
}

/**
 * Deeply merges configuration objects while protecting against prototype pollution.
 */
export function customDeepMerge(
  first?: ((path: string[]) => MergeStrategy | undefined) | MergeableObject,
  ...rest: MergeableObject[]
): MergeableObject {
  const getStrategy =
    typeof first === 'function' ? first : getMergeStrategyForPath;
  const sources =
    typeof first === 'function' ? rest : first ? [first, ...rest] : rest;
  const result: MergeableObject = {};

  for (const source of sources) {
    if (source && isPlainObject(source)) {
      mergeRecursively(result, source, getStrategy);
    }
  }

  return result;
}

function setNestedProperty(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const keys = dotPath.split('.');
  const lastKey = keys.pop();
  if (!lastKey || isUnsafeKey(lastKey)) return;

  let current: Record<string, unknown> = obj;
  for (const key of keys) {
    if (isUnsafeKey(key)) return;
    const existing = current[key];
    if (existing === undefined) {
      const nextObj: Record<string, unknown> = {};
      current[key] = nextObj;
      current = nextObj;
    } else if (isPlainObject(existing)) {
      current = existing;
    } else {
      return;
    }
  }
  current[lastKey] = value;
}

function getNestedProperty(
  obj: Record<string, unknown>,
  dotPath: string,
): unknown {
  const keys = dotPath.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (isUnsafeKey(key) || !isPlainObject(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function migrateInvertedBoolean(
  container: Record<string, unknown>,
  oldKey: string,
  newKey: string,
): void {
  const oldVal = container[oldKey];
  const newVal = container[newKey];
  if (typeof oldVal === 'boolean') {
    if (typeof newVal !== 'boolean') {
      container[newKey] = !oldVal;
    }
    delete container[oldKey];
  }
}

/**
 * Intercepts a V1 (flat) or hybrid settings object in memory and converts
 * legacy/deprecated keys into the V2 hierarchical structure.
 */
export function migrateDeprecatedSettings(
  rawSettings: Record<string, unknown>,
): Settings {
  if (!isPlainObject(rawSettings)) {
    return {};
  }

  const v2Settings: Record<string, unknown> = {};
  const remainingKeys = new Set(
    Object.keys(rawSettings).filter((k) => !isUnsafeKey(k)),
  );

  // Normalize boolean telemetry: true/false -> { enabled: true/false }
  const rawTelemetry = rawSettings['telemetry'];
  if (typeof rawTelemetry === 'boolean') {
    setNestedProperty(v2Settings, 'telemetry.enabled', rawTelemetry);
    remainingKeys.delete('telemetry');
  }

  // Handle legacy telemetryDisabled -> telemetry.enabled = !telemetryDisabled
  const telemetryDisabledVal = rawSettings['telemetryDisabled'];
  if (typeof telemetryDisabledVal === 'boolean') {
    if (getNestedProperty(v2Settings, 'telemetry.enabled') === undefined) {
      setNestedProperty(v2Settings, 'telemetry.enabled', !telemetryDisabledVal);
    }
    remainingKeys.delete('telemetryDisabled');
  }

  for (const [oldKey, newPath] of Object.entries(MIGRATION_MAP)) {
    // Skip keys where oldKey === newPath so V2 top-level containers are merged in the second pass
    if (oldKey === newPath) {
      continue;
    }
    if (remainingKeys.has(oldKey)) {
      let val = rawSettings[oldKey];
      // If a key is both a V1 key and a V2 container (e.g., 'model') and holds an object,
      // preserve it as a V2 container so it is deep-merged in the carry-over pass.
      if (KNOWN_V2_CONTAINERS.has(oldKey) && isPlainObject(val)) {
        continue;
      }

      // Normalize legacy boolean checkpointing: true -> { enabled: true }
      if (oldKey === 'checkpointing' && typeof val === 'boolean') {
        val = { enabled: val };
      }

      // Normalize legacy object chatCompression: { contextPercentageThreshold: n } -> n
      if (oldKey === 'chatCompression' && isPlainObject(val)) {
        const threshold = val['contextPercentageThreshold'];
        if (typeof threshold === 'number') {
          val = threshold;
        }
      }

      setNestedProperty(v2Settings, newPath, val);
      remainingKeys.delete(oldKey);
    }
  }

  // Carry over and deep-merge any remaining V2 containers or custom keys (V2 takes precedence over V1)
  for (const key of remainingKeys) {
    const newVal = rawSettings[key];
    if (newVal === undefined) continue;
    const existingVal = v2Settings[key];
    if (isPlainObject(existingVal) && isPlainObject(newVal)) {
      v2Settings[key] = customDeepMerge(
        (subPath: string[]) => getMergeStrategyForPath([key, ...subPath]),
        existingVal,
        newVal,
      );
    } else {
      v2Settings[key] = newVal;
    }
  }

  // Migrate deprecated nested boolean/property settings within V2 containers
  const generalObj = v2Settings['general'];
  if (isPlainObject(generalObj)) {
    const checkpointingVal = generalObj['checkpointing'];
    if (typeof checkpointingVal === 'boolean') {
      generalObj['checkpointing'] = { enabled: checkpointingVal };
    }
    migrateInvertedBoolean(generalObj, 'disableAutoUpdate', 'enableAutoUpdate');
    migrateInvertedBoolean(
      generalObj,
      'disableUpdateNag',
      'enableAutoUpdateNotification',
    );
  }

  const uiObj = v2Settings['ui'];
  if (isPlainObject(uiObj)) {
    const accessibilityObj = uiObj['accessibility'];
    if (isPlainObject(accessibilityObj)) {
      migrateInvertedBoolean(
        accessibilityObj,
        'disableLoadingPhrases',
        'enableLoadingPhrases',
      );
      const enableLP = accessibilityObj['enableLoadingPhrases'];
      if (
        typeof enableLP === 'boolean' &&
        uiObj['loadingPhrases'] === undefined
      ) {
        if (!enableLP) {
          uiObj['loadingPhrases'] = 'off';
        }
      }
    }
  }

  const contextObj = v2Settings['context'];
  if (isPlainObject(contextObj)) {
    const fileFilteringObj = contextObj['fileFiltering'];
    if (isPlainObject(fileFilteringObj)) {
      migrateInvertedBoolean(
        fileFilteringObj,
        'disableFuzzySearch',
        'enableFuzzySearch',
      );
    }
  }

  const toolsObj = v2Settings['tools'];
  if (isPlainObject(toolsObj)) {
    const approvalModeVal = toolsObj['approvalMode'];
    if (approvalModeVal !== undefined) {
      const targetGeneral = isPlainObject(v2Settings['general'])
        ? v2Settings['general']
        : {};
      if (targetGeneral['defaultApprovalMode'] === undefined) {
        targetGeneral['defaultApprovalMode'] = approvalModeVal;
      }
      v2Settings['general'] = targetGeneral;
      delete toolsObj['approvalMode'];
    }
  }

  return v2Settings as Settings;
}

const booleanPreprocess = z.preprocess((val) => {
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return val;
}, z.boolean());

const numberPreprocess = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
  }
  return val;
}, z.number());

export const settingsZodSchema = z
  .object({
    mcpServers: z
      .record(z.string(), z.record(z.string(), z.unknown()))
      .optional(),
    mcp: z
      .object({
        serverCommand: z.string().optional(),
        allowed: z.array(z.string()).optional(),
        excluded: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    tools: z
      .object({
        allowed: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
        core: z.array(z.string()).optional(),
        autoAccept: booleanPreprocess.optional(),
        sandbox: z
          .union([
            booleanPreprocess,
            z.string(),
            z.record(z.string(), z.unknown()),
          ])
          .optional(),
        enableHooks: booleanPreprocess.optional(),
        discoveryCommand: z.string().optional(),
        callCommand: z.string().optional(),
        useRipgrep: booleanPreprocess.optional(),
        shell: z
          .object({
            enableInteractiveShell: booleanPreprocess.optional(),
            pager: z.string().optional(),
            showColor: booleanPreprocess.optional(),
            inactivityTimeout: numberPreprocess.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    telemetry: z
      .union([
        booleanPreprocess,
        z
          .object({
            enabled: booleanPreprocess.optional(),
            target: z.string().optional(),
            otlpEndpoint: z.string().optional(),
            otlpProtocol: z.string().optional(),
            logPrompts: booleanPreprocess.optional(),
            outfile: z.string().optional(),
            useCollector: booleanPreprocess.optional(),
          })
          .passthrough(),
      ])
      .optional(),
    logging: z
      .object({
        level: z.string().optional(),
      })
      .passthrough()
      .optional(),
    ui: z
      .object({
        theme: z.string().optional(),
        showMemoryUsage: booleanPreprocess.optional(),
        showLineNumbers: booleanPreprocess.optional(),
        showCitations: booleanPreprocess.optional(),
        showStatusInTitle: booleanPreprocess.optional(),
        hideWindowTitle: booleanPreprocess.optional(),
        hideTips: booleanPreprocess.optional(),
        hideBanner: booleanPreprocess.optional(),
        hideFooter: booleanPreprocess.optional(),
        hideContextSummary: booleanPreprocess.optional(),
        loadingPhrases: z.string().optional(),
        customThemes: z.record(z.string(), z.unknown()).optional(),
        customWittyPhrases: z.array(z.string()).optional(),
        footer: z
          .object({
            hideCWD: booleanPreprocess.optional(),
            hideSandboxStatus: booleanPreprocess.optional(),
            hideModelInfo: booleanPreprocess.optional(),
          })
          .passthrough()
          .optional(),
        accessibility: z
          .object({
            enableLoadingPhrases: booleanPreprocess.optional(),
            screenReader: booleanPreprocess.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    general: z
      .object({
        previewFeatures: booleanPreprocess.optional(),
        vimMode: booleanPreprocess.optional(),
        preferredEditor: z.string().optional(),
        checkpointing: z
          .object({
            enabled: booleanPreprocess.optional(),
          })
          .passthrough()
          .optional(),
        enableAutoUpdate: booleanPreprocess.optional(),
        enableAutoUpdateNotification: booleanPreprocess.optional(),
        defaultApprovalMode: z.string().optional(),
        debugKeystrokeLogging: booleanPreprocess.optional(),
        enablePromptCompletion: booleanPreprocess.optional(),
        retryFetchErrors: booleanPreprocess.optional(),
        plan: z
          .object({
            enabled: booleanPreprocess.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    context: z
      .object({
        fileName: z.union([z.string(), z.array(z.string())]).optional(),
        includeDirectories: z.array(z.string()).optional(),
        loadFromIncludeDirectories: booleanPreprocess.optional(),
        importFormat: z.string().optional(),
        discoveryMaxDirs: numberPreprocess.optional(),
        fileFiltering: z
          .object({
            respectGitIgnore: booleanPreprocess.optional(),
            respectGeminiIgnore: booleanPreprocess.optional(),
            enableRecursiveFileSearch: booleanPreprocess.optional(),
            enableFuzzySearch: booleanPreprocess.optional(),
            customIgnoreFilePaths: z.array(z.string()).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    security: z
      .object({
        folderTrust: z
          .object({
            enabled: booleanPreprocess.optional(),
            featureEnabled: booleanPreprocess.optional(),
          })
          .passthrough()
          .optional(),
        auth: z
          .object({
            selectedType: z.string().optional(),
            enforcedType: z.string().optional(),
            useExternal: booleanPreprocess.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    model: z
      .object({
        name: z.string().optional(),
        maxSessionTurns: numberPreprocess.optional(),
        compressionThreshold: numberPreprocess.optional(),
        skipNextSpeakerCheck: booleanPreprocess.optional(),
        summarizeToolOutput: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    ide: z
      .object({
        enabled: booleanPreprocess.optional(),
        hasSeenNudge: booleanPreprocess.optional(),
      })
      .passthrough()
      .optional(),
    privacy: z
      .object({
        usageStatisticsEnabled: booleanPreprocess.optional(),
      })
      .passthrough()
      .optional(),
    advanced: z
      .object({
        autoConfigureMemory: booleanPreprocess.optional(),
        bugCommand: z.record(z.string(), z.unknown()).optional(),
        dnsResolutionOrder: z.string().optional(),
        excludedEnvVars: z.array(z.string()).optional(),
        ignoreLocalEnv: booleanPreprocess.optional(),
      })
      .passthrough()
      .optional(),
    experimental: z
      .object({
        enableAgents: booleanPreprocess.optional(),
        skills: booleanPreprocess.optional(),
        extensionManagement: booleanPreprocess.optional(),
        worktrees: booleanPreprocess.optional(),
      })
      .passthrough()
      .optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
    agents: z.record(z.string(), z.unknown()).optional(),
    policyPaths: z.array(z.string()).optional(),
    adminPolicyPaths: z.array(z.string()).optional(),
  })
  .passthrough()
  .superRefine((obj, ctx) => {
    for (const key of Object.keys(obj)) {
      if (LEGACY_V1_ONLY_KEYS.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Unmigrated V1 setting '${key}' is not valid at the root of V2 settings.`,
        });
      }
    }
  });

export function validateSettings(data: unknown): {
  success: boolean;
  data?: Settings;
  error?: z.ZodError;
} {
  const result = settingsZodSchema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      data: result.data as Settings,
    };
  }
  return {
    success: false,
    error: result.error,
  };
}

function loadAndMigrateFile(
  filePath: string,
  settingsErrors: SettingsError[],
): Settings {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(stripJsonComments(content));
      if (!isPlainObject(parsed)) {
        settingsErrors.push({
          message: 'Settings file is not a valid JSON object.',
          path: filePath,
        });
        return {};
      }
      const resolved = resolveEnvVarsInObject(parsed);
      const migrated = migrateDeprecatedSettings(resolved);
      const validation = validateSettings(migrated);
      if (!validation.success && validation.error) {
        settingsErrors.push({
          message: validation.error.message,
          path: filePath,
        });
        return migrated;
      }
      return validation.data ?? migrated;
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: filePath,
    });
  }
  return {};
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings if the workspace is trusted.
 *
 * How is it different to gemini-cli/cli: Returns already merged settings rather
 * than `LoadedSettings` (unnecessary since we are not modifying users
 * settings.json).
 */
export function loadSettings(
  workspaceDir: string,
  isTrustedOverride?: boolean,
): Settings {
  const settingsErrors: SettingsError[] = [];
  const userSettings = loadAndMigrateFile(USER_SETTINGS_PATH, settingsErrors);

  let isTrusted = isTrustedOverride;
  if (isTrusted === undefined) {
    const isFolderTrustEnabled =
      userSettings.security?.folderTrust?.enabled ?? true;
    const { isTrusted: trustResult } = checkPathTrust({
      path: workspaceDir,
      isFolderTrustEnabled,
      isHeadless: isHeadlessMode(),
    });
    isTrusted = trustResult ?? false;
  }

  const workspaceSettingsPath = path.join(
    workspaceDir,
    GEMINI_DIR,
    'settings.json',
  );

  const workspaceSettings = isTrusted
    ? loadAndMigrateFile(workspaceSettingsPath, settingsErrors)
    : {};

  if (settingsErrors.length > 0) {
    debugLogger.error('Errors loading settings:');
    for (const error of settingsErrors) {
      debugLogger.error(`  Path: ${error.path}`);
      debugLogger.error(`  Message: ${error.message}`);
    }
  }

  const mergedSettings = customDeepMerge(
    getMergeStrategyForPath,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    userSettings as MergeableObject,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    workspaceSettings as MergeableObject,
  ) as Settings;

  // Security: ensure policyPaths and adminPolicyPaths are only loaded from trusted, user-level
  // configuration and cannot be overridden by workspace-level settings, even if the
  // workspace is trusted.
  mergedSettings.policyPaths = userSettings.policyPaths;
  mergedSettings.adminPolicyPaths = userSettings.adminPolicyPaths;

  return mergedSettings;
}

export function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+?)(?::-([^}]*))?})/g;
  return value.replace(
    envVarRegex,
    (
      match: string,
      varName1?: string,
      varName2?: string,
      defaultValue?: string,
    ) => {
      const varName = varName1 || varName2;
      if (!varName) {
        return match;
      }
      const envValue = process?.env?.[varName];
      if (typeof envValue === 'string') {
        return envValue;
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      return match;
    },
  );
}

export function resolveEnvVarsInObject<T>(obj: T): T {
  return resolveEnvVarsInObjectInternal(obj, new WeakSet());
}

function resolveEnvVarsInObjectInternal<T>(
  obj: T,
  visited: WeakSet<object>,
): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    if (visited.has(obj)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return [...obj] as unknown as T;
    }
    visited.add(obj);
    const mapped = obj.map((item: unknown) =>
      resolveEnvVarsInObjectInternal(item, visited),
    );
    visited.delete(obj);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return mapped as unknown as T;
  }

  if (typeof obj === 'object') {
    if (!isPlainObject(obj)) {
      return obj;
    }
    const objRef = obj as object;
    if (visited.has(objRef)) {
      return { ...obj } as T;
    }
    visited.add(objRef);
    const newObj: Record<string, unknown> = {};
     
    const sourceRecord = obj as Record<string, unknown>;
    for (const key of Object.keys(sourceRecord)) {
      if (isUnsafeKey(key)) {
        continue;
      }
      newObj[key] = resolveEnvVarsInObjectInternal(sourceRecord[key], visited);
    }
    visited.delete(objRef);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return newObj as unknown as T;
  }

  return obj;
}
