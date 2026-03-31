/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-side API handlers for the web GUI:
 * - Command proxy (POST /api/command)
 * - File search / read (POST /api/files/search, /api/files/read)
 * - Chat streaming (POST /api/chat)
 */

import type http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import {
  type Config,
  type ConversationRecord,
  DiscoveredMCPTool,
  AuthType,
  LlmRole,
  getVersion,
  flattenMemory,
  performInit,
  getDisplayString,
  resolveModel,
  SESSION_FILE_PREFIX,
} from '@google/gemini-cli-core';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-return */

// ── Command Proxy ────────────────────────────────────────────────────────────

const ALLOWED_COMMANDS = new Set([
  'stats',
  'tools',
  'memory',
  'about',
  'compress',
  'theme',
  'corgi',
  'help',
  'init',
  'mcp',
  'plan',
  'skills',
  'model',
  'clear',
  'resume',
  'copy',
  'extensions',
  'tasks',
]);

type CmdResult = {
  ok: boolean;
  type: 'info' | 'error';
  text: string;
  data?: unknown;
  /** When set, the client should auto-send this as a chat message. */
  prompt?: string;
};

function resolveWebModel(gcConfig: Config, requestedModel?: string): string {
  const model = requestedModel || gcConfig.getModel();
  return resolveModel(
    model,
    gcConfig.getGemini31LaunchedSync?.() ?? false,
    gcConfig.getGemini31FlashLiteLaunchedSync?.() ?? false,
    gcConfig.getUseCustomToolModelSync?.() ?? false,
    gcConfig.getHasAccessToPreviewModel?.() ?? true,
    gcConfig,
  );
}

type WebSessionSummary = {
  id: string;
  sessionId: string;
  title: string;
  updatedAt: number;
  time: string;
  messageCount: number;
  cwd: string;
  source: 'cli';
};

type WebChatMessage = {
  role: 'user' | 'model';
  content: string;
  display?: string;
};

function partListToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          if ('text' in part && typeof part.text === 'string') {
            return part.text;
          }
          if (
            'functionCall' in part &&
            part.functionCall &&
            typeof part.functionCall === 'object'
          ) {
            const fn = part.functionCall as {
              name?: string;
              args?: unknown;
            };
            return `[Tool call: ${fn.name ?? 'unknown'}${fn.args ? ` ${JSON.stringify(fn.args)}` : ''}]`;
          }
          if (
            'functionResponse' in part &&
            part.functionResponse &&
            typeof part.functionResponse === 'object'
          ) {
            const fn = part.functionResponse as {
              name?: string;
              response?: unknown;
            };
            return `[Tool result: ${fn.name ?? 'unknown'}${fn.response ? ` ${JSON.stringify(fn.response)}` : ''}]`;
          }
        }
        return '';
      })
      .join('');
  }
  if (content && typeof content === 'object' && 'text' in content) {
    const part = content as { text?: unknown };
    return typeof part.text === 'string' ? part.text : '';
  }
  return '';
}

function cleanMessage(message: string): string {
  return message.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFirstUserMessage(
  messages: ConversationRecord['messages'],
): string {
  const firstMeaningful = messages.find((msg) => {
    if (msg.type !== 'user') {
      return false;
    }
    const content = partListToText(msg.content).trim();
    return (
      Boolean(content) && !content.startsWith('/') && !content.startsWith('?')
    );
  });
  const fallback = messages.find((msg) => msg.type === 'user');
  const content = firstMeaningful
    ? partListToText(firstMeaningful.content)
    : fallback
      ? partListToText(fallback.content)
      : 'Empty conversation';
  return cleanMessage(content) || 'Empty conversation';
}

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSeconds < 60) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths < 12
    ? `${diffMonths}mo`
    : `${Math.floor(diffMonths / 12)}y`;
}

function getChatsDir(gcConfig: Config): string {
  return path.join(gcConfig.storage.getProjectTempDir(), 'chats');
}

async function listCliSessions(gcConfig: Config): Promise<WebSessionSummary[]> {
  const chatsDir = getChatsDir(gcConfig);
  let files: string[] = [];
  try {
    files = await fs.readdir(chatsDir);
  } catch {
    return [];
  }

  const sessionFiles = files
    .filter(
      (file) => file.startsWith(SESSION_FILE_PREFIX) && file.endsWith('.json'),
    )
    .sort()
    .reverse();

  const cwd = gcConfig.getWorkingDir?.() ?? process.cwd();
  const sessions = await Promise.all(
    sessionFiles.map(async (file): Promise<WebSessionSummary | null> => {
      try {
        const filePath = path.join(chatsDir, file);
        const raw = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(raw) as ConversationRecord;
        const title = extractFirstUserMessage(session.messages);
        return {
          id: file,
          sessionId: session.sessionId,
          title,
          updatedAt: new Date(session.lastUpdated).getTime(),
          time: formatRelativeTime(session.lastUpdated),
          messageCount: session.messages.length,
          cwd,
          source: 'cli',
        };
      } catch {
        return null;
      }
    }),
  );

  return sessions.filter((session): session is WebSessionSummary =>
    Boolean(session),
  );
}

async function readCliSession(
  gcConfig: Config,
  fileName: string,
): Promise<ConversationRecord | null> {
  const chatsDir = getChatsDir(gcConfig);
  const resolved = path.resolve(chatsDir, fileName);
  if (!resolved.startsWith(chatsDir + path.sep)) {
    return null;
  }
  try {
    const raw = await fs.readFile(resolved, 'utf-8');
    return JSON.parse(raw) as ConversationRecord;
  } catch {
    return null;
  }
}

function convertConversationToWebMessages(
  conversation: ConversationRecord,
): WebChatMessage[] {
  const webMessages: WebChatMessage[] = [];

  for (const msg of conversation.messages) {
    if (msg.type === 'info' || msg.type === 'error' || msg.type === 'warning') {
      continue;
    }

    const display = msg.displayContent
      ? partListToText(msg.displayContent)
      : '';
    const content = partListToText(msg.content);
    const text = (display || content).trim();
    if (!text) {
      continue;
    }

    if (msg.type === 'user') {
      webMessages.push({
        role: 'user',
        content,
        display: text,
      });
      continue;
    }

    let modelText = text;
    if (msg.type === 'gemini' && msg.thoughts?.length) {
      const thoughtLines = msg.thoughts
        .map((thought: { subject?: string; description: string }) =>
          thought.subject
            ? `**${thought.subject}** ${thought.description}`
            : thought.description,
        )
        .filter(Boolean);
      if (thoughtLines.length) {
        modelText = `${thoughtLines.join('\n')}\n\n${modelText}`.trim();
      }
    }

    if (msg.type === 'gemini' && msg.toolCalls?.length) {
      const toolLines = msg.toolCalls.map(
        (toolCall: { displayName?: string; name: string; status?: string }) => {
          const label = toolCall.displayName || toolCall.name;
          const status = toolCall.status || 'unknown';
          return `- Tool ${label}: ${status}`;
        },
      );
      if (toolLines.length) {
        modelText = `${modelText}\n\n${toolLines.join('\n')}`.trim();
      }
    }

    webMessages.push({
      role: 'model',
      content: modelText,
    });
  }

  return webMessages;
}

export async function handleCommandProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gcConfig: Config | null,
): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let command: string;
  let subcommand: string | undefined;
  try {
    const parsed = JSON.parse(body);
    command = parsed.command;
    subcommand = parsed.subcommand;
    if (typeof command !== 'string') throw new Error();
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        type: 'error',
        text: 'Invalid request body.',
      }),
    );
    return;
  }

  if (!ALLOWED_COMMANDS.has(command)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        type: 'error',
        text: `Command "${command}" is not available in the web GUI.`,
      }),
    );
    return;
  }

  if (!gcConfig) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        type: 'error',
        text: 'CLI not initialized.',
      }),
    );
    return;
  }

  const result = await runCommand(gcConfig, command, subcommand);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

async function runCommand(
  gcConfig: Config,
  command: string,
  _subcommand?: string,
): Promise<CmdResult> {
  try {
    switch (command) {
      case 'stats':
        return await cmdStats(gcConfig);
      case 'tools':
        return cmdTools(gcConfig);
      case 'memory':
        return cmdMemory(gcConfig);
      case 'about':
        return await cmdAbout(gcConfig);
      case 'compress':
        return cmdCompress();
      case 'theme':
        return cmdTheme();
      case 'corgi':
        return cmdCorgi();
      case 'help':
        return cmdHelp();
      case 'init':
        return await cmdInit(gcConfig);
      case 'mcp':
        return cmdMcp(gcConfig);
      case 'plan':
        return cmdPlan(gcConfig);
      case 'skills':
        return cmdSkills(gcConfig);
      case 'model':
        return cmdModel(gcConfig);
      case 'clear':
        return cmdClear();
      case 'resume':
        return cmdResume(gcConfig);
      case 'copy':
        return cmdCopy();
      case 'extensions':
        return cmdExtensions(gcConfig);
      case 'tasks':
        return cmdTasks(gcConfig);
      default:
        return {
          ok: false,
          type: 'error',
          text: `Unknown command: ${command}`,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, type: 'error', text: msg };
  }
}

// ── Command Handlers ─────────────────────────────────────────────────────────

async function cmdStats(gcConfig: Config): Promise<CmdResult> {
  const model = gcConfig.getModel();
  const activeModel = gcConfig.getActiveModel?.() ?? model;
  const authType = gcConfig.getContentGeneratorConfig()?.authType ?? 'unknown';
  const tier = gcConfig.getUserTierName() ?? 'unknown';
  const sessionId = gcConfig.getSessionId?.() ?? 'unknown';
  const quotaRemaining = gcConfig.getQuotaRemaining();
  const quotaLimit = gcConfig.getQuotaLimit();
  const quotaReset = gcConfig.getQuotaResetTime();

  // Gather available models for usage display
  const availableModels: string[] = [];
  if (gcConfig.modelConfigService) {
    const defs = gcConfig.modelConfigService.getModelDefinitions?.() ?? {};
    const hasPreview = gcConfig.getHasAccessToPreviewModel?.() ?? false;
    const useGemini31 = gcConfig.getGemini31LaunchedSync?.() ?? false;
    const useGemini31FlashLite =
      gcConfig.getGemini31FlashLiteLaunchedSync?.() ?? false;
    for (const [id, def] of Object.entries(defs)) {
      if (!def.isVisible) continue;
      if (def.isPreview && !hasPreview) continue;
      const resolvedId = gcConfig.modelConfigService.resolveModelId(id, {
        useGemini3_1: useGemini31,
        useGemini3_1FlashLite: useGemini31FlashLite,
        hasAccessToPreview: hasPreview,
      });
      if (!availableModels.includes(resolvedId))
        availableModels.push(resolvedId);
    }
  }

  const data = {
    model,
    activeModel,
    authType,
    tier,
    sessionId,
    quotaRemaining,
    quotaLimit,
    quotaReset,
    quotaPct: quotaLimit
      ? Math.round(((quotaLimit - (quotaRemaining ?? 0)) / quotaLimit) * 100)
      : null,
    availableModels,
  };

  const lines = [`Model: ${model}`, `Auth: ${authType}`, `Tier: ${tier}`];
  if (quotaLimit != null && quotaRemaining != null) {
    lines.push(
      `Quota: ${quotaRemaining}/${quotaLimit} remaining (resets ${quotaReset ?? 'unknown'})`,
    );
  }

  return { ok: true, type: 'info', text: lines.join('\n'), data };
}

function cmdTools(gcConfig: Config): CmdResult {
  const tools = gcConfig.toolRegistry.getAllTools();
  const list = tools.map((t) => ({
    name: t.name,
    description: (t as unknown as { description?: string }).description ?? '',
  }));

  return {
    ok: true,
    type: 'info',
    text: `${list.length} tools available`,
    data: { tools: list },
  };
}

function cmdMemory(gcConfig: Config): CmdResult {
  const raw = gcConfig.getUserMemory();
  let sections: Array<{ name: string; content: string }> = [];

  if (typeof raw === 'string') {
    sections = raw ? [{ name: 'Memory', content: raw }] : [];
  } else {
    const mem = raw;
    if (mem.global?.trim())
      sections.push({ name: 'Global', content: mem.global.trim() });
    if (mem.userProjectMemory?.trim())
      sections.push({
        name: 'User Project',
        content: mem.userProjectMemory.trim(),
      });
    if (mem.extension?.trim())
      sections.push({ name: 'Extension', content: mem.extension.trim() });
    if (mem.project?.trim())
      sections.push({ name: 'Project', content: mem.project.trim() });
  }

  return {
    ok: true,
    type: 'info',
    text: flattenMemory(raw) || 'No memory configured.',
    data: { sections },
  };
}

async function cmdAbout(gcConfig: Config): Promise<CmdResult> {
  const version = await getVersion();
  const model = gcConfig.getModel();
  const authType = gcConfig.getContentGeneratorConfig()?.authType ?? 'unknown';
  const osInfo = `${process.platform} ${process.arch}`;

  const data = { version, model, authType, os: osInfo };
  return {
    ok: true,
    type: 'info',
    text: `Gemini CLI v${version}\nModel: ${model}\nAuth: ${authType}\nOS: ${osInfo}`,
    data,
  };
}

function cmdCompress(): CmdResult {
  return {
    ok: true,
    type: 'info',
    text: 'Context compression is managed automatically. Use /compress in the CLI terminal for manual compression.',
  };
}

function cmdTheme(): CmdResult {
  const themes = ['dark', 'light', 'ocean', 'forest'];
  return {
    ok: true,
    type: 'info',
    text: `Available themes: ${themes.join(', ')}`,
    data: { themes },
  };
}

function cmdCorgi(): CmdResult {
  return {
    ok: true,
    type: 'info',
    text: '    \u2571|\u3001\n  (\u02da\u02ce \u30027\n   |\u3001\u02dc\u3035\n   \u3058\u3057\u02cd,)\u30ce\n\n  woof!',
  };
}

function cmdHelp(): CmdResult {
  const cmds = [
    { cmd: '/model', desc: 'Change the AI model' },
    { cmd: '/clear', desc: 'Clear the chat history' },
    { cmd: '/stats', desc: 'Show session statistics' },
    { cmd: '/tools', desc: 'List available tools' },
    { cmd: '/memory', desc: 'View GEMINI.md memory' },
    { cmd: '/about', desc: 'Show version info' },
    { cmd: '/theme', desc: 'Change the visual theme' },
    { cmd: '/compress', desc: 'Compress context' },
    { cmd: '/mcp', desc: 'Manage MCP servers' },
    { cmd: '/skills', desc: 'Manage skills' },
    { cmd: '/plan', desc: 'Switch to Plan Mode' },
    { cmd: '/copy', desc: 'Copy last message' },
    { cmd: '/corgi', desc: 'A friendly corgi' },
    { cmd: '/help', desc: 'Show this help' },
  ];
  return {
    ok: true,
    type: 'info',
    text: cmds.map((c) => `${c.cmd.padEnd(12)} ${c.desc}`).join('\n'),
    data: { commands: cmds },
  };
}

// ── MCP Command ────────────────────────────────────────────────────────────

function cmdMcp(gcConfig: Config): CmdResult {
  // Use proper Config methods like CLI does
  const mcpClientManager = gcConfig.getMcpClientManager();
  const toolRegistry = gcConfig.toolRegistry;

  if (!mcpClientManager) {
    return {
      ok: true,
      type: 'info',
      text: 'MCP: No MCP client manager available.',
      data: { servers: [], tools: [], prompts: [], resources: [] },
    };
  }

  try {
    // Get MCP servers from the client manager
    const mcpServers = mcpClientManager.getMcpServers() ?? {};
    const serverNames = Object.keys(mcpServers);

    // Get all tools and filter to MCP tools only
    const allTools = toolRegistry.getAllTools();
    const mcpTools = allTools.filter(
      (tool): tool is DiscoveredMCPTool => tool instanceof DiscoveredMCPTool,
    );

    // Get MCP prompts from prompt registry
    const promptRegistry = gcConfig.getPromptRegistry();
    const allPrompts = promptRegistry.getAllPrompts();
    const mcpPrompts = allPrompts.filter(
      (prompt) =>
        'serverName' in prompt && serverNames.includes(prompt.serverName),
    );

    // Get MCP resources from resource registry
    const resourceRegistry = gcConfig.getResourceRegistry();
    const allResources = resourceRegistry.getAllResources();
    const mcpResources = allResources.filter((entry) =>
      serverNames.includes(entry.serverName),
    );

    // Format server info
    const servers = serverNames.map((name) => {
      const server = mcpServers[name];
      const status = mcpClientManager.getLastError(name)
        ? 'error'
        : 'connected';
      return {
        name,
        status,
        url: server?.url || server?.httpUrl || '',
      };
    });

    // Format tool info
    const tools = mcpTools.map((tool) => ({
      serverName: tool.serverName,
      name: tool.name,
      description: tool.description || '',
      schema: tool.schema,
    }));

    // Format prompt info
    const prompts = mcpPrompts.map((prompt) => ({
      serverName: (prompt as { serverName: string }).serverName,
      name: prompt.name,
      description: prompt.description || '',
    }));

    // Format resource info
    const resources = mcpResources.map((resource) => ({
      serverName: resource.serverName,
      name: resource.name,
      uri: resource.uri,
      mimeType: resource.mimeType,
      description: resource.description || '',
    }));

    const serverList =
      servers.length > 0 ? servers.map((s) => s.name).join(', ') : 'none';

    return {
      ok: true,
      type: 'info',
      text: `MCP Servers (${servers.length}): ${serverList}\nTools: ${tools.length}\nPrompts: ${prompts.length}\nResources: ${resources.length}`,
      data: {
        servers,
        tools,
        prompts,
        resources,
        subcommands: [
          'list',
          'desc',
          'schema',
          'reload',
          'enable',
          'disable',
          'auth',
        ],
      },
    };
  } catch (err) {
    return {
      ok: true,
      type: 'info',
      text: `MCP: ${err instanceof Error ? err.message : 'Error loading MCP service'}`,
      data: { servers: [], tools: [], prompts: [], resources: [] },
    };
  }
}

// ── Plan Command ────────────────────────────────────────────────────────────

function cmdPlan(_gcConfig: Config): CmdResult {
  // Plan mode is primarily a CLI terminal feature
  // In web UI, we can show info about it
  return {
    ok: true,
    type: 'info',
    text: 'Plan Mode: Use /plan in the CLI terminal to switch to Plan Mode. In Plan Mode, you can review and approve AI-generated plans before execution.',
    data: {
      description:
        'Plan Mode allows you to review AI-generated plans before they are executed',
      available: true,
    },
  };
}

// ── Skills Command ──────────────────────────────────────────────────────────

function cmdSkills(gcConfig: Config): CmdResult {
  // Get skills service from config if available
  const skillsService = (gcConfig as unknown as { skillsService?: unknown })
    .skillsService;

  if (!skillsService) {
    return {
      ok: true,
      type: 'info',
      text: 'Skills: No skills service available in web mode.',
      data: { skills: [] },
    };
  }

  try {
    const skills = skillsService as {
      getSkills?: () => Array<{
        name: string;
        description: string;
        enabled: boolean;
      }>;
    };

    const skillList = skills.getSkills?.() ?? [];

    return {
      ok: true,
      type: 'info',
      text: `Skills (${skillList.length}): ${skillList.map((s: { name: string }) => s.name).join(', ') || 'none'}`,
      data: { skills: skillList },
    };
  } catch (err) {
    return {
      ok: true,
      type: 'info',
      text: `Skills: ${err instanceof Error ? err.message : 'Error loading skills service'}`,
      data: { skills: [] },
    };
  }
}

// ── Model Command ───────────────────────────────────────────────────────────

function cmdModel(gcConfig: Config): CmdResult {
  const model = gcConfig.getModel();
  const activeModel = gcConfig.getActiveModel?.() ?? model;

  // Return info that will trigger model picker UI
  return {
    ok: true,
    type: 'info',
    text: `Current model: ${activeModel}`,
    data: {
      current: activeModel,
      showPicker: true, // Signal to UI to show model picker
    },
  };
}

// ── Clear Command ───────────────────────────────────────────────────────────

function cmdClear(): CmdResult {
  return {
    ok: true,
    type: 'info',
    text: 'Chat cleared.',
    data: { clear: true },
  };
}

// ── Resume Command ──────────────────────────────────────────────────────────

function cmdResume(_gcConfig: Config): CmdResult {
  // Resume is mainly for CLI - in web we can list available sessions
  return {
    ok: true,
    type: 'info',
    text: 'To resume a session, select from the Sessions panel on the left.',
    data: {
      action: 'show_sessions',
      description: 'Resume a previous CLI session',
    },
  };
}

// ── Copy Command ───────────────────────────────────────────────────────────

function cmdCopy(): CmdResult {
  return {
    ok: true,
    type: 'info',
    text: 'Use the copy button on the last message to copy it to clipboard.',
    data: {
      action: 'copy_last',
      description: 'Click the copy icon on any message to copy it',
    },
  };
}

// ── Extensions Command ─────────────────────────────────────────────────────

function cmdExtensions(gcConfig: Config): CmdResult {
  // Get extensions from config if available
  const extensionsService = (
    gcConfig as unknown as { extensionsService?: unknown }
  ).extensionsService;

  if (!extensionsService) {
    return {
      ok: true,
      type: 'info',
      text: 'Extensions: No extensions service available.',
      data: { extensions: [] },
    };
  }

  try {
    const extensions = extensionsService as {
      getExtensions?: () => Array<{
        name: string;
        version: string;
        enabled: boolean;
      }>;
    };

    const extList = extensions.getExtensions?.() ?? [];

    return {
      ok: true,
      type: 'info',
      text: `Extensions (${extList.length}): ${extList.map((e: { name: string }) => e.name).join(', ') || 'none'}`,
      data: { extensions: extList },
    };
  } catch (err) {
    return {
      ok: true,
      type: 'info',
      text: `Extensions: ${err instanceof Error ? err.message : 'Error loading extensions'}`,
      data: { extensions: [] },
    };
  }
}

// ── Tasks Command ───────────────────────────────────────────────────────────

function cmdTasks(gcConfig: Config): CmdResult {
  // Get task service from config if available
  const taskService = (gcConfig as unknown as { taskService?: unknown })
    .taskService;

  if (!taskService) {
    return {
      ok: true,
      type: 'info',
      text: 'Tasks: No task tracking available in web mode.',
      data: { tasks: [] },
    };
  }

  try {
    const tasks = taskService as {
      getTasks?: () => Array<{
        id: string;
        description: string;
        status: string;
      }>;
    };

    const taskList = tasks.getTasks?.() ?? [];

    return {
      ok: true,
      type: 'info',
      text: `Tasks (${taskList.length}): ${taskList.map((t: { description: string }) => t.description).join(', ') || 'none'}`,
      data: { tasks: taskList },
    };
  } catch (err) {
    return {
      ok: true,
      type: 'info',
      text: `Tasks: ${err instanceof Error ? err.message : 'Error loading tasks'}`,
      data: { tasks: [] },
    };
  }
}

// ── Init Command ────────────────────────────────────────────────────────────

async function cmdInit(gcConfig: Config): Promise<CmdResult> {
  const targetDir = gcConfig.getTargetDir?.() ?? process.cwd();
  const geminiMdPath = path.join(targetDir, 'GEMINI.md');

  let exists = false;
  try {
    await fs.access(geminiMdPath);
    exists = true;
  } catch {
    /* doesn't exist */
  }

  const result = performInit(exists);

  if (result.type === 'submit_prompt') {
    await fs.writeFile(geminiMdPath, '', 'utf-8');
    // content is PartListUnion — at runtime it's a string from performInit
    const promptText =
      typeof result.content === 'string'
        ? result.content
        : String(result.content);
    return {
      ok: true,
      type: 'info',
      text: 'Empty GEMINI.md created. Analyzing the project...',
      prompt: promptText,
    };
  }

  if (result.type === 'message') {
    return {
      ok: true,
      type: 'info',
      text: result.content,
    };
  }

  return {
    ok: true,
    type: 'info',
    text: 'Init completed.',
  };
}

// ── File Search / Read (for @ mentions) ─────────────────────────────────────

const BINARY_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.mov',
  '.mkv',
  '.flac',
  '.ogg',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.xz',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pyc',
  '.class',
  '.o',
  '.obj',
  '.wasm',
]);

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.cache',
  '.vscode',
  '.idea',
  'coverage',
  '.nyc_output',
]);

async function walkFiles(
  dir: string,
  base: string,
  results: string[],
  limit: number,
): Promise<void> {
  if (results.length >= limit) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= limit) return;
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        await walkFiles(full, base, results, limit);
      }
    } else {
      results.push(rel);
    }
  }
}

export async function handleFileSearch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let query: string;
  try {
    const parsed = JSON.parse(body);
    query = (parsed.query || '').toLowerCase();
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request.' }));
    return;
  }

  const cwd = process.cwd();
  const allFiles: string[] = [];
  await walkFiles(cwd, cwd, allFiles, 5000);

  // Fuzzy match: all query chars must appear in order
  const matches = query
    ? allFiles.filter((f) => {
        const fl = f.toLowerCase();
        let qi = 0;
        for (let fi = 0; fi < fl.length && qi < query.length; fi++) {
          if (fl[fi] === query[qi]) qi++;
        }
        return qi === query.length;
      })
    : allFiles;

  // Score: prefer shorter paths and those starting with query
  const scored = matches.slice(0, 50).map((f) => {
    const fl = f.toLowerCase();
    let score = f.length;
    if (fl.includes('/' + query) || fl.startsWith(query)) score -= 100;
    return { path: f, score };
  });
  scored.sort((a, b) => a.score - b.score);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ files: scored.slice(0, 20).map((s) => s.path) }));
}

export async function handleFileRead(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let filePath: string;
  try {
    const parsed = JSON.parse(body);
    filePath = parsed.path;
    if (typeof filePath !== 'string') throw new Error();
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request.' }));
    return;
  }

  // Security: prevent path traversal
  const cwd = process.cwd();
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied: path outside project.' }));
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  if (BINARY_EXTS.has(ext)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        content: `[Binary file: ${filePath}]`,
        truncated: false,
      }),
    );
    return;
  }

  try {
    const content = await fs.readFile(resolved, 'utf-8');
    const maxLen = 50_000;
    const truncated = content.length > maxLen;
    const stat = await fs.stat(resolved);
    const totalLines = content.split('\n').length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        content: truncated ? content.slice(0, maxLen) : content,
        truncated,
        path: filePath,
        bytes: stat.size,
        totalLines,
        charsRead: truncated ? maxLen : content.length,
      }),
    );
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found or cannot be read.' }));
  }
}

// ── File Write ──────────────────────────────────────────────────────────────

export async function handleFileWrite(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 5_000_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let filePath: string;
  let content: string;
  try {
    const parsed = JSON.parse(body);
    filePath = parsed.path;
    content = parsed.content;
    if (typeof filePath !== 'string' || typeof content !== 'string')
      throw new Error();
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'Invalid request. Need path and content.' }),
    );
    return;
  }

  // Security: prevent path traversal
  const cwd = process.cwd();
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied: path outside project.' }));
    return;
  }

  try {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: filePath }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: `Failed to write: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

export async function handleFileOpen(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let filePath: string;
  let target: string;
  try {
    const parsed = JSON.parse(body);
    filePath = parsed.path;
    target = parsed.target;
    if (typeof filePath !== 'string' || typeof target !== 'string') {
      throw new Error();
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'Invalid request. Need path and target.' }),
    );
    return;
  }

  const cwd = process.cwd();
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied: path outside project.' }));
    return;
  }

  try {
    await fs.access(resolved);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found.' }));
    return;
  }

  let command = '';
  let args: string[] = [];

  if (target === 'finder') {
    if (process.platform === 'darwin') {
      command = 'open';
      args = ['-R', resolved];
    } else if (process.platform === 'win32') {
      command = 'explorer.exe';
      args = ['/select,', resolved];
    } else {
      command = 'xdg-open';
      args = [path.dirname(resolved)];
    }
  } else if (target === 'cursor') {
    command = 'cursor';
    args = [resolved];
  } else if (target === 'vscode') {
    command = 'code';
    args = [resolved];
  } else {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unsupported open target.' }));
    return;
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: `Failed to open file: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

// ── Sessions API ────────────────────────────────────────────────────────────

export async function handleSessionsList(
  res: http.ServerResponse,
  gcConfig: Config | null,
): Promise<void> {
  if (!gcConfig) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'CLI not initialized.' }));
    return;
  }

  const sessions = await listCliSessions(gcConfig);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ sessions }));
}

export async function handleSessionLoad(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gcConfig: Config | null,
): Promise<void> {
  if (!gcConfig) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'CLI not initialized.' }));
    return;
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let id: string;
  try {
    const parsed = JSON.parse(body);
    id = parsed.id;
    if (typeof id !== 'string' || !id) {
      throw new Error();
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request. Need session id.' }));
    return;
  }

  const conversation = await readCliSession(gcConfig, id);
  if (!conversation) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found.' }));
    return;
  }

  const title = extractFirstUserMessage(conversation.messages);
  const session = {
    id,
    sessionId: conversation.sessionId,
    title,
    updatedAt: new Date(conversation.lastUpdated).getTime(),
    time: formatRelativeTime(conversation.lastUpdated),
    messageCount: conversation.messages.length,
    cwd: gcConfig.getWorkingDir?.() ?? process.cwd(),
    source: 'cli' as const,
    messages: convertConversationToWebMessages(conversation),
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ session }));
}

export async function handleSessionDelete(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gcConfig: Config | null,
): Promise<void> {
  if (!gcConfig) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'CLI not initialized.' }));
    return;
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let id: string;
  try {
    const parsed = JSON.parse(body);
    id = parsed.id;
    if (typeof id !== 'string' || !id) {
      throw new Error();
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request. Need session id.' }));
    return;
  }

  const chatsDir = getChatsDir(gcConfig);
  const resolved = path.resolve(chatsDir, id);
  if (!resolved.startsWith(chatsDir + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied.' }));
    return;
  }

  try {
    await fs.unlink(resolved);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: `Failed to delete session: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

// ── Chat Streaming ───────────────────────────────────────────────────────────

export async function handleChatRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gcConfig: Config | null,
): Promise<void> {
  if (!gcConfig) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error:
          'CLI not initialized. Run /web from the Gemini CLI first to connect.',
      }),
    );
    return;
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }

  let messages: Array<{ role: string; content: string }>;
  let model: string | undefined;
  let requestCwd: string | undefined;
  try {
    const parsed = JSON.parse(body);
    messages = parsed.messages;
    model = parsed.model;
    requestCwd = parsed.cwd;
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request body.' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  try {
    const contentGenerator = gcConfig.getContentGenerator();
    const authType = gcConfig.getContentGeneratorConfig()?.authType;
    const resolvedModel = resolveWebModel(gcConfig, model);

    // Build system instruction with CLI context
    const cwd = requestCwd || (gcConfig.getWorkingDir?.() ?? process.cwd());
    let userMemory = '';
    try {
      const rawMem = gcConfig.getUserMemory?.();
      if (typeof rawMem === 'string') {
        userMemory = rawMem;
      } else if (rawMem) {
        const parts: string[] = [];
        const memObj = rawMem as Record<string, string>;
        if (memObj['global']) parts.push(memObj['global']);
        if (memObj['project']) parts.push(memObj['project']);
        userMemory = parts.join('\n\n');
      }
    } catch {
      /* ignore */
    }
    const systemParts: string[] = [
      'You are Gemini CLI, an AI coding assistant by Google, running in web GUI mode.',
      'You help users with software engineering tasks: writing code, debugging, explaining codebases, and more.',
      '',
      `Working directory: ${cwd}`,
      `Platform: ${process.platform} ${process.arch}`,
      `Model: ${resolvedModel}`,
      '',
      '## File Operations',
      'When the user asks you to create, write, generate, or save ANY file, you MUST output it using',
      'this EXACT syntax — the language tag MUST start with __FILE: followed immediately by the path:',
      '',
      '```__FILE:path/to/filename.ext',
      '(file content here)',
      '```',
      '',
      'Rules:',
      '- The __FILE: prefix MUST be the language tag (first line after the opening ```)',
      '- NEVER put __FILE: inside the code body — it must always be the language tag',
      '- Path is relative to the working directory',
      '- You may output multiple file blocks in one response',
      '- Always use __FILE: even for simple files like index.html or README.md',
      '',
      'Example — user says "create index.html":',
      '```__FILE:index.html',
      '<!DOCTYPE html>',
      '<html lang="en"><head><title>Page</title></head><body></body></html>',
      '```',
      '',
      '## Other Rules',
      'You CANNOT execute shell commands — provide them for the user to copy and run.',
      'Use markdown: code blocks with proper language tags, **bold**, bullet lists, numbered lists.',
      'Be concise, direct, and technical.',
    ];
    if (userMemory) {
      systemParts.push('', '## User Context (from GEMINI.md)', userMemory);
    }

    const contents = messages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: m.content }],
    }));

    const stream = await contentGenerator.generateContentStream(
      {
        model: resolvedModel,
        contents,
        config: {
          systemInstruction: systemParts.join('\n'),
        },
      },
      crypto.randomUUID(),
      authType === AuthType.LOGIN_WITH_GOOGLE ||
        authType === AuthType.COMPUTE_ADC
        ? LlmRole.MAIN
        : LlmRole.UTILITY_TOOL,
      req.signal,
    );

    let totalText = '';
    let lastUsage:
      | {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        }
      | undefined;
    for await (const chunk of stream) {
      if (res.destroyed) break;
      const text = chunk.text;
      if (text) {
        totalText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      // Capture usage metadata from last chunk
      const um = (chunk as unknown as Record<string, unknown>)[
        'usageMetadata'
      ] as typeof lastUsage | undefined;
      if (um) lastUsage = um;
    }

    if (totalText.length === 0) {
      res.write(
        `data: ${JSON.stringify({ error: 'Empty response — possible rate limit or content filter. Try again.' })}\n\n`,
      );
    }

    // Send token usage info
    if (lastUsage) {
      res.write(
        `data: ${JSON.stringify({
          usage: {
            input: lastUsage.promptTokenCount ?? 0,
            output: lastUsage.candidatesTokenCount ?? 0,
            total: lastUsage.totalTokenCount ?? 0,
          },
        })}\n\n`,
      );
    }

    res.write('data: [DONE]\n\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.write('data: [DONE]\n\n');
  }

  res.end();
}

// ── Models API ──────────────────────────────────────────────────────────────

export function handleModels(
  res: http.ServerResponse,
  gcConfig: Config | null,
): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  const models: Array<{
    id: string;
    label: string;
    desc: string;
    tier: string;
    active: boolean;
  }> = [];
  const currentModel = gcConfig ? resolveWebModel(gcConfig) : '';
  const hasPreview = gcConfig?.getHasAccessToPreviewModel() ?? false;
  if (gcConfig?.modelConfigService) {
    const defs = gcConfig.modelConfigService.getModelDefinitions?.() ?? {};
    const useGemini31 = gcConfig.getGemini31LaunchedSync?.() ?? false;
    const useGemini31FlashLite =
      gcConfig.getGemini31FlashLiteLaunchedSync?.() ?? false;
    const useCustomTools = gcConfig.getUseCustomToolModelSync?.() ?? false;
    for (const [id, def] of Object.entries(defs)) {
      if (!def.isVisible) continue;
      if (def.isPreview && !hasPreview) continue;
      const resolvedId = gcConfig.modelConfigService.resolveModelId(id, {
        useGemini3_1: useGemini31,
        useGemini3_1FlashLite: useGemini31FlashLite,
        useCustomTools,
        hasAccessToPreview: hasPreview,
      });
      const titleId = gcConfig.modelConfigService.resolveModelId(id, {
        useGemini3_1: useGemini31,
        useGemini3_1FlashLite: useGemini31FlashLite,
        hasAccessToPreview: hasPreview,
      });
      models.push({
        id: resolvedId,
        label: def.displayName ?? getDisplayString(titleId, gcConfig),
        desc: def.dialogDescription ?? def.tier ?? '',
        tier: def.tier ?? '',
        active: resolvedId === currentModel,
      });
    }
    const deduped = new Map<string, (typeof models)[number]>();
    for (const model of models) {
      if (!deduped.has(model.id)) {
        deduped.set(model.id, model);
      } else if (model.active) {
        deduped.set(model.id, model);
      }
    }
    models.length = 0;
    models.push(...deduped.values());
    const tierOrder: Record<string, number> = {
      pro: 0,
      flash: 1,
      'flash-lite': 2,
      auto: 3,
      custom: 4,
    };
    models.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9));
  }
  if (models.length === 0) {
    models.push(
      {
        id: 'auto-gemini-3',
        label: 'Auto (Gemini 3)',
        desc: 'Let Gemini CLI decide: gemini-3-pro or gemini-3-flash',
        tier: 'auto',
        active: false,
      },
      {
        id: 'auto-gemini-2.5',
        label: 'Auto (Gemini 2.5)',
        desc: 'Let Gemini CLI decide: gemini-2.5-pro or gemini-2.5-flash',
        tier: 'auto',
        active: false,
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        desc: 'Best quality + thinking',
        tier: 'pro',
        active: false,
      },
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        desc: 'Fast + multimodal tool use',
        tier: 'flash',
        active: false,
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        desc: 'Fast + thinking',
        tier: 'flash',
        active: false,
      },
      {
        id: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash Lite',
        desc: 'Lightweight + fast',
        tier: 'flash-lite',
        active: false,
      },
    );
  }
  const cwd = gcConfig?.getWorkingDir?.() ?? process.cwd();
  res.end(JSON.stringify({ models, current: currentModel, cwd }));
}
