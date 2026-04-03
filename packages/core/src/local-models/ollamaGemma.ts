/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThinkingLevel } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ModelConfigAlias,
  ModelDefinition,
} from '../services/modelConfigService.js';
import { homedir } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';

const execFileAsync = promisify(execFile);

const GEMMA4_MANIFEST_DIR = path.join(
  homedir(),
  '.ollama',
  'models',
  'manifests',
  'registry.ollama.ai',
  'library',
  'gemma4',
);

const KNOWN_GEMMA4_VARIANT_ORDER = ['e2b', 'e4b', '26b', '31b'];
const PREFERRED_GEMMA4_VARIANT_ORDER = ['31b', '26b', 'e4b', 'e2b'];
const PREFERRED_GEMMA4_UTILITY_VARIANT_ORDER = ['e4b', 'e2b', '26b', '31b'];
const KNOWN_GEMMA4_CONTEXT_LENGTHS: Record<string, number> = {
  e2b: 131_072,
  e4b: 131_072,
  '26b': 262_144,
  '31b': 262_144,
};

export const LOCAL_GEMMA_MODEL_FAMILY = 'local-gemma';
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_BRIDGE_HOST = '127.0.0.1';
export const DEFAULT_OLLAMA_BRIDGE_PORT = 0;

export interface OllamaGemmaSettings {
  enabled?: boolean;
  bridgeHost?: string;
  bridgePort?: number;
  ollamaBaseUrl?: string;
  simpleContextMode?: boolean;
}

export interface LocalGemmaModelCapabilities {
  completion: boolean;
  tools: boolean;
  thinking: boolean;
  vision: boolean;
  audio: boolean;
}

export interface LocalGemmaModelInfo {
  modelId: string;
  variant: string;
  displayName: string;
  dialogDescription: string;
  contextLength: number;
  parameterLabel?: string;
  capabilities: LocalGemmaModelCapabilities;
}

function formatContextLength(contextLength: number): string {
  const thousands = Math.round(contextLength / 1024);
  return `${thousands}k context`;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error && 'code' in error && typeof error.code === 'string'
  );
}

function normalizeVariant(tag: string): string {
  return tag.trim().toLowerCase();
}

function shouldSkipManifestTag(
  normalizedTag: string,
  allNormalizedTags: Set<string>,
): boolean {
  if (normalizedTag !== 'latest') {
    return false;
  }

  for (const tag of allNormalizedTags) {
    if (tag !== 'latest') {
      return true;
    }
  }

  return false;
}

function getDisplayName(variant: string): string {
  const normalized = normalizeVariant(variant);
  const suffix =
    normalized.startsWith('e') || /^\d+b$/.test(normalized)
      ? normalized.toUpperCase()
      : normalized;
  return `Gemma 4 ${suffix}`;
}

function getCapabilitiesList(
  capabilities: LocalGemmaModelCapabilities,
): string[] {
  const names: string[] = [];
  if (capabilities.tools) {
    names.push('tools');
  }
  if (capabilities.thinking) {
    names.push('thinking');
  }
  if (capabilities.vision) {
    names.push('vision');
  }
  if (capabilities.audio) {
    names.push('audio');
  }
  return names;
}

function buildDialogDescription(model: {
  contextLength: number;
  capabilities: LocalGemmaModelCapabilities;
}): string {
  const capabilities = getCapabilitiesList(model.capabilities);
  if (capabilities.length === 0) {
    return `Local via Ollama. ${formatContextLength(model.contextLength)}.`;
  }
  return `Local via Ollama. ${formatContextLength(model.contextLength)}. ${capabilities.join(', ')}.`;
}

function parseOllamaShowOutput(
  variant: string,
  stdout: string,
): Pick<
  LocalGemmaModelInfo,
  'contextLength' | 'parameterLabel' | 'capabilities'
> {
  let currentSection = '';
  let contextLength = KNOWN_GEMMA4_CONTEXT_LENGTHS[variant] ?? 131_072;
  let parameterLabel: string | undefined;

  const capabilities: LocalGemmaModelCapabilities = {
    completion: false,
    tools: false,
    thinking: false,
    vision: false,
    audio: false,
  };

  for (const rawLine of stdout.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed === 'Model' || trimmed === 'Capabilities') {
      currentSection = trimmed;
      continue;
    }

    if (currentSection === 'Model') {
      if (trimmed.startsWith('context length')) {
        const match = trimmed.match(/context length\s+(\d+)/i);
        if (match?.[1]) {
          contextLength = Number(match[1]);
        }
      } else if (trimmed.startsWith('parameters')) {
        parameterLabel = trimmed.replace(/^parameters\s+/i, '').trim();
      }
      continue;
    }

    if (currentSection === 'Capabilities') {
      switch (trimmed.toLowerCase()) {
        case 'completion':
          capabilities.completion = true;
          break;
        case 'tools':
          capabilities.tools = true;
          break;
        case 'thinking':
          capabilities.thinking = true;
          break;
        case 'vision':
          capabilities.vision = true;
          break;
        case 'audio':
          capabilities.audio = true;
          break;
        default:
          break;
      }
    }
  }

  return { contextLength, parameterLabel, capabilities };
}

async function getModelMetadata(
  variant: string,
): Promise<
  Pick<LocalGemmaModelInfo, 'contextLength' | 'parameterLabel' | 'capabilities'>
> {
  const modelId = `gemma4:${variant}`;
  try {
    const { stdout } = await execFileAsync('ollama', ['show', modelId], {
      timeout: 10_000,
    });
    return parseOllamaShowOutput(variant, stdout);
  } catch (error) {
    debugLogger.debug(
      `Failed to read Ollama metadata for ${modelId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {
      contextLength: KNOWN_GEMMA4_CONTEXT_LENGTHS[variant] ?? 131_072,
      parameterLabel: undefined,
      capabilities: {
        completion: true,
        tools: false,
        thinking: false,
        vision: false,
        audio: false,
      },
    };
  }
}

function compareVariants(a: string, b: string): number {
  const rank = (variant: string) => {
    const index = KNOWN_GEMMA4_VARIANT_ORDER.indexOf(variant);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return rank(a) - rank(b) || a.localeCompare(b);
}

export async function discoverLocalGemmaModels(): Promise<
  LocalGemmaModelInfo[]
> {
  try {
    const dirEntries = await fs.readdir(GEMMA4_MANIFEST_DIR, {
      withFileTypes: true,
    });
    const normalizedTags = new Set(
      dirEntries
        .filter((entry) => entry.isFile())
        .map((entry) => normalizeVariant(entry.name)),
    );

    const variants = dirEntries
      .filter((entry) => entry.isFile())
      .map((entry) => normalizeVariant(entry.name))
      .filter((tag) => !shouldSkipManifestTag(tag, normalizedTags))
      .sort(compareVariants);

    const discovered: LocalGemmaModelInfo[] = [];
    for (const variant of variants) {
      const metadata = await getModelMetadata(variant);
      const info: LocalGemmaModelInfo = {
        modelId: `gemma4:${variant}`,
        variant,
        displayName: getDisplayName(variant),
        dialogDescription: buildDialogDescription(metadata),
        contextLength: metadata.contextLength,
        parameterLabel: metadata.parameterLabel,
        capabilities: metadata.capabilities,
      };
      discovered.push(info);
    }

    return discovered;
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') {
      debugLogger.debug(
        `Failed to discover local Gemma models from ${GEMMA4_MANIFEST_DIR}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return [];
  }
}

export function createLocalGemmaModelDefinition(
  model: LocalGemmaModelInfo,
): ModelDefinition {
  return {
    displayName: model.displayName,
    tier: 'local',
    family: LOCAL_GEMMA_MODEL_FAMILY,
    isVisible: true,
    dialogDescription: model.dialogDescription,
    features: {
      thinking: model.capabilities.thinking,
      multimodalToolUse: model.capabilities.tools && model.capabilities.vision,
    },
  };
}

export function createLocalGemmaModelAlias(
  model: LocalGemmaModelInfo,
): ModelConfigAlias {
  return {
    extends: 'chat-base',
    modelConfig: {
      model: model.modelId,
      generateContentConfig: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    },
  };
}

export function getLocalGemmaCompressionThreshold(
  contextLength: number,
): number {
  if (contextLength <= 131_072) {
    return 0.25;
  }
  return 0.35;
}

export function getLocalGemmaToolResponseBudget(contextLength: number): number {
  return Math.min(50_000, Math.floor(contextLength * 0.15));
}

export function getPreferredLocalGemmaModel(
  models: LocalGemmaModelInfo[],
): LocalGemmaModelInfo | undefined {
  for (const variant of PREFERRED_GEMMA4_VARIANT_ORDER) {
    const match = models.find(
      (model) => normalizeVariant(model.variant) === variant,
    );
    if (match) {
      return match;
    }
  }

  return [...models]
    .sort((a, b) => compareVariants(a.variant, b.variant))
    .at(-1);
}

export function getPreferredLocalGemmaUtilityModel(
  models: LocalGemmaModelInfo[],
): LocalGemmaModelInfo | undefined {
  for (const variant of PREFERRED_GEMMA4_UTILITY_VARIANT_ORDER) {
    const match = models.find(
      (model) => normalizeVariant(model.variant) === variant,
    );
    if (match) {
      return match;
    }
  }

  return [...models].sort((a, b) => compareVariants(a.variant, b.variant))[0];
}
