/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TestRig, assertModelHasOutput } from './test-helper.js';

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const CLI_TEST_TIMEOUT_MS = 300000;
const SIMPLE_PROMPT = 'Reply with the digit 4 and nothing else.';
const JAVA_HELLO_WORLD_PROMPT =
  'Write a complete Java HelloWorld program in one code block. Use a class named HelloWorld, include a public static void main method, and print Hello, World!.';
const RED_BLUE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAQklEQVR4nO3PQREAIBADMcC/Z1Bx5LMR0M7uu2btNftwRtc/KEArQCtAK0ArQCtAK0ArQCtAK0ArQCtAK0ArQCtAe+LxAj8B7QRwAAAAAElFTkSuQmCC';

interface OllamaModelsResponse {
  data?: Array<{
    id?: unknown;
  }>;
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: unknown;
  }>;
}

interface OllamaHostState {
  apiModelIds: string[];
  downloadedModelIds: string[];
  downloadedGemmaModelIds: string[];
  functionGemmaModelId?: string;
  ready: boolean;
  skipReason?: string;
}

function isGemma4ModelId(modelId: string): boolean {
  const normalizedId = modelId.toLowerCase();
  return (
    normalizedId.includes('gemma') &&
    normalizedId.includes('4') &&
    !normalizedId.includes('embed') &&
    !normalizedId.includes('functiongemma')
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${OLLAMA_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request to ${path} failed with ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

async function detectOllamaHostState(): Promise<OllamaHostState> {
  try {
    const [modelsResponse, tagsResponse] = await Promise.all([
      fetchJson<OllamaModelsResponse>('/v1/models'),
      fetchJson<OllamaTagsResponse>('/api/tags'),
    ]);

    const apiModelIds = (modelsResponse.data ?? [])
      .map((model) => (typeof model.id === 'string' ? model.id : ''))
      .filter((modelId) => modelId.length > 0);
    const downloadedModelIds = (tagsResponse.models ?? [])
      .map((model) => (typeof model.name === 'string' ? model.name : ''))
      .filter((modelId) => modelId.length > 0);
    const downloadedGemmaModelIds = downloadedModelIds.filter(isGemma4ModelId);
    const functionGemmaModelId = downloadedModelIds.find((modelId) =>
      modelId.toLowerCase().startsWith('functiongemma:'),
    );

    if (downloadedGemmaModelIds.length === 0) {
      return {
        apiModelIds,
        downloadedModelIds,
        downloadedGemmaModelIds,
        functionGemmaModelId,
        ready: false,
        skipReason: 'No downloaded Gemma 4 Ollama models were found.',
      };
    }

    return {
      apiModelIds,
      downloadedModelIds,
      downloadedGemmaModelIds,
      functionGemmaModelId,
      ready: true,
    };
  } catch (error) {
    return {
      apiModelIds: [],
      downloadedModelIds: [],
      downloadedGemmaModelIds: [],
      functionGemmaModelId: undefined,
      ready: false,
      skipReason:
        error instanceof Error ? error.message : 'Unable to reach Ollama.',
    };
  }
}

function createLocalOllamaSettings(modelName = 'gemma4') {
  return {
    sandbox: false,
    security: {
      auth: {
        selectedType: 'local-ollama',
      },
    },
    localModel: {
      backend: 'ollama',
      baseUrl: OLLAMA_BASE_URL,
    },
    model: {
      name: modelName,
    },
  };
}

async function runJsonPrompt(
  rig: TestRig,
  prompt: string,
  args: string[] = [],
  options: {
    env?: Record<string, string | undefined>;
    stdin?: string;
  } = {},
): Promise<{
  response: string;
  session_id: string;
  stats: Record<string, unknown>;
}> {
  const result = await rig.run({
    args: [prompt, '--output-format', 'json', ...args],
    env: options.env,
    stdin: options.stdin,
    timeout: CLI_TEST_TIMEOUT_MS,
  });
  const parsed = JSON.parse(result) as {
    response?: unknown;
    session_id?: unknown;
    stats?: unknown;
  };

  expect(typeof parsed.response).toBe('string');
  expect(typeof parsed.session_id).toBe('string');
  expect(parsed.stats).toBeTruthy();

  return {
    response: parsed.response as string,
    session_id: parsed.session_id as string,
    stats: parsed.stats as Record<string, unknown>,
  };
}

function findMatchingModel(
  modelIds: readonly string[],
  pattern: RegExp,
  options: { excludeCloud?: boolean; requireCloud?: boolean } = {},
): string | undefined {
  return modelIds.find((modelId) => {
    const matchesPattern = pattern.test(modelId);
    const isCloud = /cloud/i.test(modelId);
    if (!matchesPattern) {
      return false;
    }
    if (options.excludeCloud && isCloud) {
      return false;
    }
    if (options.requireCloud && !isCloud) {
      return false;
    }
    return true;
  });
}

function getPreferredGemma4Model(modelIds: readonly string[]): string {
  return (
    findMatchingModel(modelIds, /26b|26/i) ??
    findMatchingModel(modelIds, /31b|31/i) ??
    findMatchingModel(modelIds, /e4b/i) ??
    findMatchingModel(modelIds, /e2b/i) ??
    modelIds[0]!
  );
}

function getFastestAvailableGemmaModel(modelIds: readonly string[]): string {
  return (
    findMatchingModel(modelIds, /e2b/i) ??
    findMatchingModel(modelIds, /e4b/i) ??
    findMatchingModel(modelIds, /26b|26/i) ??
    findMatchingModel(modelIds, /31b|31/i) ??
    modelIds[0]!
  );
}

function getAvailableAliasTargets(
  modelIds: readonly string[],
): Array<{ alias: string; target: string }> {
  const aliasTargets = [
    {
      alias: 'gemma4',
      target: getPreferredGemma4Model(modelIds),
    },
    {
      alias: 'gemma4-26b',
      target: findMatchingModel(modelIds, /26b|26/i),
    },
    {
      alias: 'gemma4-31b',
      target: findMatchingModel(modelIds, /31b|31/i, { excludeCloud: true }),
    },
    {
      alias: 'gemma4-31b-cloud',
      target: findMatchingModel(modelIds, /31b|31/i, { requireCloud: true }),
    },
    {
      alias: 'gemma4-e4b',
      target: findMatchingModel(modelIds, /e4b/i),
    },
    {
      alias: 'gemma4-e2b',
      target: findMatchingModel(modelIds, /e2b/i),
    },
  ];

  return aliasTargets.filter(
    (entry): entry is { alias: string; target: string } =>
      typeof entry.target === 'string' && entry.target.length > 0,
  );
}

async function waitForLastApiRequest(rig: TestRig) {
  const found = await rig.waitForTelemetryEvent(
    'api_request',
    CLI_TEST_TIMEOUT_MS,
  );
  expect(found).toBe(true);

  const lastRequest = rig.readLastApiRequest();
  expect(lastRequest).toBeTruthy();

  const attributes = (lastRequest?.attributes || {}) as Record<string, unknown>;
  expect(typeof attributes['model']).toBe('string');

  return {
    model: attributes['model'] as string,
    requestText:
      typeof attributes['request_text'] === 'string'
        ? (attributes['request_text'] as string)
        : undefined,
  };
}

function expectJavaHelloWorld(response: string) {
  expect(response).toContain('HelloWorld');
  expect(response).toMatch(/public\s+class\s+HelloWorld/);
  expect(response).toMatch(/public\s+static\s+void\s+main\s*\(/);
  expect(response).toContain('System.out.println');
  expect(response).toContain('Hello, World!');
}

function writeRedBlueImage(testDir: string): string {
  const imagePath = join(testDir, 'red-blue.png');
  writeFileSync(imagePath, Buffer.from(RED_BLUE_PNG_BASE64, 'base64'));
  return imagePath;
}

const ollamaHostState = await detectOllamaHostState();
const availableAliasTargets = getAvailableAliasTargets(
  ollamaHostState.downloadedGemmaModelIds,
);
const preferredGemma4Model = ollamaHostState.ready
  ? getPreferredGemma4Model(ollamaHostState.downloadedGemmaModelIds)
  : undefined;
const fastestAvailableGemmaModel = ollamaHostState.ready
  ? getFastestAvailableGemmaModel(ollamaHostState.downloadedGemmaModelIds)
  : undefined;
const suiteName = ollamaHostState.ready
  ? 'local-ollama-gemma4'
  : `local-ollama-gemma4 (skipped: ${ollamaHostState.skipReason ?? 'unknown reason'})`;

describe.skipIf(!ollamaHostState.ready)(suiteName, () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should detect host Ollama and expose downloaded Gemma 4 models', async () => {
    expect(ollamaHostState.apiModelIds.length).toBeGreaterThan(0);
    expect(ollamaHostState.downloadedModelIds.length).toBeGreaterThan(0);
    expect(ollamaHostState.downloadedGemmaModelIds.length).toBeGreaterThan(0);
    expect(
      ollamaHostState.apiModelIds,
      'Expected Ollama /v1/models to include every downloaded Gemma 4 model',
    ).toEqual(expect.arrayContaining(ollamaHostState.downloadedGemmaModelIds));
    expect(availableAliasTargets.length).toBeGreaterThan(0);
  });

  it('should resolve gemma4 to the preferred discovered Ollama model', async () => {
    rig.setup('local-ollama-gemma4-default-alias', {
      settings: createLocalOllamaSettings(),
    });

    const parsed = await runJsonPrompt(rig, SIMPLE_PROMPT);
    const lastRequest = await waitForLastApiRequest(rig);

    expect(lastRequest.model).toBe(preferredGemma4Model);
    expect(lastRequest.requestText).toContain(SIMPLE_PROMPT);
    assertModelHasOutput(parsed.response);
    expect(parsed.session_id.length).toBeGreaterThan(0);
  });

  it.each(availableAliasTargets)(
    'should resolve local Gemma 4 alias $alias to $target',
    async ({ alias, target }) => {
      rig.setup(`local-ollama-alias-${alias.replace(/[^a-z0-9]+/gi, '-')}`, {
        settings: createLocalOllamaSettings(alias),
      });

      const parsed = await runJsonPrompt(rig, SIMPLE_PROMPT, [
        '--model',
        alias,
      ]);
      const lastRequest = await waitForLastApiRequest(rig);

      expect(lastRequest.model).toBe(target);
      assertModelHasOutput(parsed.response);
      expect(parsed.session_id.length).toBeGreaterThan(0);
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it.each(ollamaHostState.downloadedGemmaModelIds)(
    'should generate Java hello world with downloaded Ollama model %s',
    async (modelId) => {
      rig.setup(`local-ollama-model-${modelId.replace(/[^a-z0-9]+/gi, '-')}`, {
        settings: createLocalOllamaSettings(modelId),
      });

      const parsed = await runJsonPrompt(rig, JAVA_HELLO_WORLD_PROMPT, [
        '--model',
        modelId,
      ]);
      const lastRequest = await waitForLastApiRequest(rig);

      expect(lastRequest.model).toBe(modelId);
      assertModelHasOutput(parsed.response);
      expectJavaHelloWorld(parsed.response);
      expect(parsed.session_id.length).toBeGreaterThan(0);
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    'should allow --local-backend ollama to activate local Gemma 4 without local auth in settings',
    async () => {
      rig.setup('local-ollama-cli-arg-backend', {
        settings: {
          security: {
            auth: {
              selectedType: '',
            },
          },
          model: {
            name: fastestAvailableGemmaModel,
          },
        },
      });

      const parsed = await runJsonPrompt(rig, SIMPLE_PROMPT, [
        '--local-backend',
        'ollama',
        '--model',
        fastestAvailableGemmaModel!,
      ]);
      const lastRequest = await waitForLastApiRequest(rig);

      expect(lastRequest.model).toBe(fastestAvailableGemmaModel);
      assertModelHasOutput(parsed.response);
      expect(parsed.session_id.length).toBeGreaterThan(0);
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    'should allow GEMINI_LOCAL_BACKEND to activate local Gemma 4 without local auth in settings',
    async () => {
      rig.setup('local-ollama-env-backend', {
        settings: {
          security: {
            auth: {
              selectedType: '',
            },
          },
          model: {
            name: fastestAvailableGemmaModel,
          },
        },
      });

      const parsed = await runJsonPrompt(
        rig,
        SIMPLE_PROMPT,
        ['--model', fastestAvailableGemmaModel!],
        {
          env: {
            GEMINI_LOCAL_BACKEND: 'ollama',
          },
        },
      );
      const lastRequest = await waitForLastApiRequest(rig);

      expect(lastRequest.model).toBe(fastestAvailableGemmaModel);
      assertModelHasOutput(parsed.response);
      expect(parsed.session_id.length).toBeGreaterThan(0);
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    'should honor localModel.modelMapping overrides for gemma4 aliases',
    async () => {
      const mappedTarget =
        findMatchingModel(ollamaHostState.downloadedGemmaModelIds, /e4b/i) ??
        fastestAvailableGemmaModel;

      rig.setup('local-ollama-model-mapping', {
        settings: {
          ...createLocalOllamaSettings(),
          localModel: {
            backend: 'ollama',
            baseUrl: OLLAMA_BASE_URL,
            modelMapping: {
              gemma4: mappedTarget,
            },
          },
        },
      });

      const parsed = await runJsonPrompt(rig, SIMPLE_PROMPT, [
        '--model',
        'gemma4',
      ]);
      const lastRequest = await waitForLastApiRequest(rig);

      expect(lastRequest.model).toBe(mappedTarget);
      assertModelHasOutput(parsed.response);
      expect(parsed.session_id.length).toBeGreaterThan(0);
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    'should analyze a local image correctly with a multimodal Gemma 4 model',
    async () => {
      rig.setup('local-ollama-image-analysis', {
        settings: createLocalOllamaSettings(fastestAvailableGemmaModel),
      });

      const imagePath = writeRedBlueImage(rig.testDir!);

      const parsed = await runJsonPrompt(
        rig,
        `Analyze @${imagePath}. Reply with exactly: left red right blue.`,
        ['--model', fastestAvailableGemmaModel!],
      );
      const lastRequest = await waitForLastApiRequest(rig);
      const normalizedResponse = parsed.response
        .toLowerCase()
        .replace(/\s+/g, ' ');

      expect(lastRequest.model).toBe(fastestAvailableGemmaModel);
      assertModelHasOutput(parsed.response);
      expect(normalizedResponse).toContain('left');
      expect(normalizedResponse).toContain('red');
      expect(normalizedResponse).toContain('right');
      expect(normalizedResponse).toContain('blue');
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    'should support visible reasoning output without leaking raw thought channel tokens',
    async () => {
      rig.setup('local-ollama-thinking-mode', {
        settings: createLocalOllamaSettings(fastestAvailableGemmaModel),
      });

      const parsed = await runJsonPrompt(
        rig,
        'Respond in exactly two lines. Line 1 starts with "Reasoning:" and briefly explains why 17 * 19 equals 323. Line 2 starts with "Answer:" and ends with 323.',
        ['--model', fastestAvailableGemmaModel!],
      );
      const lastRequest = await waitForLastApiRequest(rig);

      expect(lastRequest.model).toBe(fastestAvailableGemmaModel);
      assertModelHasOutput(parsed.response);
      expect(parsed.response).toContain('Reasoning:');
      expect(parsed.response).toContain('Answer:');
      expect(parsed.response).toContain('323');
      expect(parsed.response).not.toContain('<|channel|>thought');
      expect(parsed.response).not.toContain('<|think|>');
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    'should use read_file successfully with the preferred local Gemma 4 model',
    async () => {
      rig.setup('local-ollama-gemma4-read-file', {
        settings: {
          ...createLocalOllamaSettings(),
          tools: {
            core: ['read_file'],
          },
        },
      });

      const secret = `gemma4-local-secret-${Date.now()}`;
      rig.createFile('secret.txt', secret);

      const result = await rig.run({
        args: 'Read secret.txt and reply with its exact contents only.',
        timeout: CLI_TEST_TIMEOUT_MS,
      });

      const foundToolCall = await rig.waitForToolCall(
        'read_file',
        CLI_TEST_TIMEOUT_MS,
      );

      expect(foundToolCall).toBe(true);
      assertModelHasOutput(result);
      expect(result).toContain(secret);
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it.skipIf(!ollamaHostState.functionGemmaModelId)(
    'should allow enabling FunctionGemma tool filtering for local Gemma 4 on Ollama',
    async () => {
      rig.setup('local-ollama-functiongemma-filtering', {
        settings: {
          ...createLocalOllamaSettings(fastestAvailableGemmaModel),
          localModel: {
            backend: 'ollama',
            baseUrl: OLLAMA_BASE_URL,
            toolFiltering: {
              enabled: true,
              model: ollamaHostState.functionGemmaModelId,
              fallbackBehavior: 'all-tools',
              maxContextMessages: 3,
            },
          },
          tools: {
            core: ['read_file', 'write_file'],
          },
        },
      });

      const secret = `functiongemma-secret-${Date.now()}`;
      rig.createFile('filter.txt', secret);

      const result = await rig.run({
        args: [
          `Use the read_file tool on ${rig.testDir!}/filter.txt and reply with its exact contents only.`,
        ],
        timeout: CLI_TEST_TIMEOUT_MS,
      });
      const lastRequest = await waitForLastApiRequest(rig);

      expect(lastRequest.model).toBe(fastestAvailableGemmaModel);
      assertModelHasOutput(result);
      expect(result).toContain('filter.txt');
    },
    CLI_TEST_TIMEOUT_MS,
  );
});
