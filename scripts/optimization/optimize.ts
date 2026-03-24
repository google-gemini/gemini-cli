/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ai, AxGEPA, ax } from '@ax-llm/ax';
import { evaluateToolAlignment } from './evals/metrics/toolAlignment.js';
import { evaluateBrevity } from './evals/metrics/brevityMetric.js';
import type { Scenario, ToolCall } from './evals/schema.js';

interface OptimizationConfig {
  models: {
    student: { provider: string; modelId: string };
    teacher: { provider: string; modelId: string };
  };
  gepa: {
    numTrials?: number;
    minibatch?: boolean;
    maxMetricCalls?: number;
  };
  paths?: {
    scenarios?: string;
    targets?: string;
    outputDir?: string;
  };
}

interface AxPrediction {
  tool_calls?: ToolCall[];
  output_text?: string;
}

interface MetricArgs {
  prediction: AxPrediction;
  example: Scenario;
}

let currentCallCount = 0;
let maxCallsExpected = 0;

/**
 * multiObjectiveMetric: Evaluates model performance with structured logging.
 */
function multiObjectiveMetric({ prediction, example }: MetricArgs): Record<string, number> {
  currentCallCount++;
  
  const modelOutput = {
    tool_calls: prediction.tool_calls || [],
    output_text: prediction.output_text || '',
  };

  const alignment = evaluateToolAlignment(modelOutput, example);
  const brevity = evaluateBrevity(modelOutput);

  // eslint-disable-next-line no-console
  console.log(`\n[ EVAL: ${currentCallCount}/${maxCallsExpected} | ${example.id} ]`);
  // eslint-disable-next-line no-console
  console.log(`Scores: Acc=${alignment.score.toFixed(2)} | Brev=${brevity.score.toFixed(2)}`);

  return {
    accuracy: alignment.score,
    brevity: brevity.score,
  };
}

/**
 * Evolve a specific target snippet using GEPA.
 */
async function evolveTarget(
  id: string,
  allTargets: any[],
  scenarios: any[],
  config: OptimizationConfig,
  apiKey: string,
  outputDir: string
) {
  // eslint-disable-next-line no-console
  console.log(`\n🎯 TARGETED EVOLUTION: ${id}`);

  const target = allTargets.find((t) => t.id === id);
  const backgroundContext = allTargets
    .filter((t) => t.id !== id)
    .map((t) => `\n### ${t.id}\n${t.maskedText}`)
    .join('\n');

  const student = ai({
    name: config.models.student.provider,
    apiKey,
    config: { model: config.models.student.modelId },
  });

  const teacher = ai({
    name: config.models.teacher.provider,
    apiKey,
    config: { model: config.models.teacher.modelId },
  });

  // Standard field names to avoid signature validation errors.
  const gcliProgram = ax(
    'user_query:string, platform:string, tags:string[], background_context:string -> tool_calls:json, output_text:string',
    { instructions: target.maskedText }
  );

  const dataset = scenarios.map(s => ({ ...s, background_context: backgroundContext }));

  const optimizer = new AxGEPA({
    studentAI: student,
    teacherAI: teacher,
    numTrials: config.gepa.numTrials || 16,
    minibatch: config.gepa.minibatch !== false,
    verbose: true,
  });

  currentCallCount = 0;
  maxCallsExpected = config.gepa.maxMetricCalls || 100;

  const result = (await optimizer.compile(
    gcliProgram,
    dataset,
    multiObjectiveMetric,
    {
      maxMetricCalls: maxCallsExpected,
    }
  )) as any;

  // Save to consolidated registry
  const resultsPath = path.join(outputDir, 'results.json');
  let registry: Record<string, any> = {};
  if (fs.existsSync(resultsPath)) {
    registry = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  }

  // The 'instruction' field in result.optimizedProgram contains the winner for the mutable part
  const optimizedText = result.optimizedProgram?.instruction || "ERROR_EXTRACTING";

  registry[id] = {
    timestamp: new Date().toISOString(),
    bestScore: result.optimizedProgram?.bestScore,
    optimizedText,
    stats: result.stats,
    report: result.report,
    paretoFront: result.paretoFront?.map((entry: any) => ({
      scores: entry.scores,
      isBest: entry.isBest,
      text: entry.instruction || entry.program?.instruction
    }))
  };

  fs.writeFileSync(resultsPath, JSON.stringify(registry, null, 2));

  // eslint-disable-next-line no-console
  console.log(`✅ Evolution complete for ${id}.`);
}

/**
 * Main Optimization Runner.
 */
export async function runOptimization(configPath: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

  if (!fs.existsSync(configPath)) throw new Error(`Config not found: ${configPath}`);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as OptimizationConfig;
  const scenariosPath = config.paths?.scenarios || 'data/tool_alignment.jsonl';
  const targetsPath = config.paths?.targets || 'data/optimization/targets.json';
  const outputDir = config.paths?.outputDir || 'data/optimization';

  if (!fs.existsSync(targetsPath)) throw new Error(`Targets file not found: ${targetsPath}`);

  const allTargets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
  const scenarios = fs
    .readFileSync(scenariosPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const data = JSON.parse(line);
      return {
        id: data.id,
        user_query: data.input.user_query,
        platform: data.metadata?.platform || 'unknown',
        tags: data.metadata?.tags || [],
        expected: data.expected,
        negatives: data.negatives || [],
      };
    });

  // Iterative mode over ALL targets
  const targetsToOptimize = allTargets;

  if (config.gepa.numTrials === 1) {
    // eslint-disable-next-line no-console
    console.log('🧪 Micro-Trial detected: Optimizing first target.');
    await evolveTarget(targetsToOptimize[0].id, allTargets, scenarios.slice(0, 2), config, apiKey, outputDir);
  } else {
    for (const t of targetsToOptimize) {
      await evolveTarget(t.id, allTargets, scenarios, config, apiKey, outputDir);
    }
  }
}

// CLI Entrypoint
const currentFilePath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && fs.realpathSync(currentFilePath) === fs.realpathSync(process.argv[1]);

if (isMain) {
  const configPath = path.join(path.dirname(currentFilePath), 'optimization.config.json');
  runOptimization(configPath).catch(console.error);
}
