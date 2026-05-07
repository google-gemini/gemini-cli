/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Schema } from '@google/genai';
import * as path from 'node:path';
import {
  LlmAgent,
  FunctionTool,
  MCPToolset,
  SkillToolset,
  loadSkillFromDir,
  type ToolUnion,
  type Skill,
  type LlmAgentConfig,
} from '@google/adk';
import type { Config, MCPServerConfig } from '../../config/config.js';
import type { AnyDeclarativeTool } from '../../tools/tools.js';
import { getCoreSystemPrompt } from '../../core/prompts.js';
import type { SkillDefinition } from '../../skills/skillLoader.js';
import { AdkDynamicGeminiModel } from './adk-dynamic-model.js';

export class LlmAgentWithDynamicModel extends LlmAgent {
  override model: AdkDynamicGeminiModel;

  constructor({ model, ...rest }: LlmAgentConfig) {
    super({ ...rest, model });

    // TODO: use config to get API key
    const apiKey =
      process.env['GOOGLE_GENAI_API_KEY'] || process.env['GEMINI_API_KEY'];
    this.model = new AdkDynamicGeminiModel({ model: model!, apiKey });
  }

  setModel(model: string) {
    this.model.setModel(model);
  }

  setConfig(_config: Record<string, unknown>) {}
}

export async function createAdkAgent(
  model: string,
  config: Config,
): Promise<LlmAgentWithDynamicModel> {
  return new LlmAgentWithDynamicModel({
    name: 'gemini-cli-agent',
    model,
    globalInstruction: getGlobalInstruction(config),
    tools: await getAdkTools(config),
    generateContentConfig: {
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  });
}

async function getAdkTools(config: Config) {
  const tools: ToolUnion[] = [];

  const toolRegistry = config.toolRegistry;
  const allToolNames = toolRegistry.getAllToolNames();
  for (const toolId of allToolNames) {
    const tool = toolRegistry.getTool(toolId);
    if (tool) {
      tools.push(toAdkTool(tool));
    }
  }

  const mcps = config.getMcpServers() || {};
  for (const [toolPrefix, mcpServerConfig] of Object.entries(mcps)) {
    tools.push(toAdkMCPToolset(mcpServerConfig, toolPrefix));
  }

  const skillsManager = config.getSkillManager();
  const skills = skillsManager.getSkills();
  tools.push(await getAdkSkillsToolset(skills));

  return tools;
}

function getGlobalInstruction(config: Config) {
  const systemMemory = config.getSystemInstructionMemory();

  return getCoreSystemPrompt(config, systemMemory);
}

function toAdkTool(tool: AnyDeclarativeTool): FunctionTool {
  const scheme = tool.getSchema();
  return new FunctionTool({
    name: tool.name,
    description: tool.description,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    parameters: scheme.parametersJsonSchema as Schema,
    execute: async (params, invocationContext) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tool.buildAndExecute(params as object, invocationContext!.abortSignal!),
  });
}

function toAdkMCPToolset(
  mcpServerConfig: MCPServerConfig,
  toolPrefix: string,
): MCPToolset {
  if (mcpServerConfig.type === 'http') {
    return new MCPToolset(
      {
        type: 'StreamableHTTPConnectionParams',
        url: mcpServerConfig.httpUrl!,
        timeout: mcpServerConfig.timeout,
        sseReadTimeout: mcpServerConfig.timeout,
        terminateOnClose: true,
        transportOptions: {
          requestInit: {
            headers: mcpServerConfig.headers,
          },
        },
      },
      mcpServerConfig.includeTools,
      toolPrefix,
    );
  }

  return new MCPToolset(
    {
      type: 'StdioConnectionParams',
      serverParams: {
        command: mcpServerConfig.command!,
        args: mcpServerConfig.args,
      },
      timeout: mcpServerConfig.timeout,
    },
    mcpServerConfig.includeTools,
    toolPrefix,
  );
}

async function getAdkSkillsToolset(
  skills: SkillDefinition[],
): Promise<SkillToolset> {
  const loadedSkills: Array<Promise<Skill>> = [];

  for (const skill of skills) {
    const skilDir = path.dirname(skill.location);

    loadedSkills.push(loadSkillFromDir(skilDir));
  }

  return new SkillToolset(await Promise.all(loadedSkills));
}
