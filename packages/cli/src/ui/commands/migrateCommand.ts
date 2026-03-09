/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'comment-json';
import type {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';
import { CommandKind } from './types.js';
import {
  MessageType,
} from '../types.js';
import { SettingScope } from '../../config/settings.js';

const migrateClaudeAction = async (
  context: CommandContext,
): Promise<SlashCommandActionReturn> => {
  const startTime = Date.now();
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const cwd = process.cwd();
  const reports: string[] = [];
  let migratedAny = false;

  // Track detailed stats for the summary
  const stats = {
    mdCloned: false,
    mcpCount: 0,
    mcpNames: [] as string[],
    skillsCount: 0,
    commandsCount: 0,
    hooksCount: 0,
    scriptsUpdated: 0,
    policyGenerated: false,
  };

  context.ui.addItem({ type: MessageType.INFO, text: '📦 **Migrating your workflow...**' });

  // 1. Migrate CLAUDE.md to GEMINI.md (with @imports for skills)
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  const geminiMdPath = path.join(cwd, 'GEMINI.md');

  try {
    await fs.access(claudeMdPath);
    let geminiMdContent = await fs.readFile(claudeMdPath, 'utf-8');
    
    migratedAny = true;
    
    try {
      await fs.access(geminiMdPath);
      reports.push('ℹ️ GEMINI.md already exists, skipping CLAUDE.md clone.');
    } catch {
      await fs.writeFile(geminiMdPath, geminiMdContent);
      stats.mdCloned = true;
    }
  } catch {
    // CLAUDE.md doesn't exist
  }

  // 2. Migrate .claude.json MCP servers
  const claudeJsonPath = path.join(cwd, '.claude.json');
  try {
    const content = await fs.readFile(claudeJsonPath, 'utf-8');
    const claudeConfig = parse(content) as any;

    if (claudeConfig.mcpServers) {
      const { settings } = context.services;
      if (settings) {
        const currentMcpServers = settings.merged.mcpServers || {};
        const newMcpServers = { ...currentMcpServers };

        for (const [name, serverConfig] of Object.entries(claudeConfig.mcpServers)) {
          if (!newMcpServers[name]) {
            newMcpServers[name] = serverConfig as any;
            stats.mcpCount++;
            stats.mcpNames.push(name);
          }
        }

        if (stats.mcpCount > 0) {
          settings.setValue(SettingScope.User, 'mcpServers', newMcpServers);
          migratedAny = true;
        }
      }
    }
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      reports.push(`❌ Error reading .claude.json: ${(error as Error).message}`);
    }
  }

  // 3. Migrate Skills (.claude/skills/* -> .gemini/skills/*)
  const claudeSkillsDir = path.join(cwd, '.claude', 'skills');
  const geminiSkillsDir = path.join(cwd, '.gemini', 'skills');
  let migratedSkills: string[] = [];

  // Get existing skill names to prevent conflicts
  const skillManager = config.getSkillManager();
  const existingSkillNames = new Set(skillManager.getAllSkills().map(s => s.name));

  try {
    const entries = await fs.readdir(claudeSkillsDir, { withFileTypes: true });
    if (entries.length > 0) {
      await fs.mkdir(geminiSkillsDir, { recursive: true });
      
      for (const entry of entries) {
        let skillName = entry.name.replace(/\.md$/, '');
        
        // Handle conflict with existing Gemini skills (like find-skills)
        if (existingSkillNames.has(skillName)) {
          skillName = `claude-${skillName}`;
        }

        const targetSkillDir = path.join(geminiSkillsDir, skillName);
        const targetSkillFile = path.join(targetSkillDir, 'SKILL.md');

        try {
          await fs.access(targetSkillFile);
          continue;
        } catch {
          // Proceed
        }

        let skillContent = '';
        if (entry.isDirectory()) {
          const sourceSkillFile = path.join(claudeSkillsDir, entry.name, 'SKILL.md');
          try {
            skillContent = await fs.readFile(sourceSkillFile, 'utf-8');
          } catch {
            try {
              skillContent = await fs.readFile(path.join(claudeSkillsDir, entry.name, 'index.md'), 'utf-8');
            } catch {
              continue;
            }
          }
        } else if (entry.name.endsWith('.md')) {
          skillContent = await fs.readFile(path.join(claudeSkillsDir, entry.name), 'utf-8');
        }

        if (skillContent) {
          await fs.mkdir(targetSkillDir, { recursive: true });
          // Ensure YAML frontmatter if missing (Gemini style)
          if (!skillContent.trim().startsWith('---')) {
            skillContent = `---\nname: ${skillName}\ndescription: Migrated from Claude Code\n---\n\n${skillContent}`;
          } else {
            // Update name in existing frontmatter if it was prefixed
            skillContent = skillContent.replace(/^name:.*$/m, `name: ${skillName}`);
          }
          await fs.writeFile(targetSkillFile, skillContent);
          migratedSkills.push(skillName);
          stats.skillsCount++;
        }
      }

      if (stats.skillsCount > 0) {
        migratedAny = true;

        try {
          let currentGeminiMd = await fs.readFile(geminiMdPath, 'utf-8');
          const imports = migratedSkills.map(s => `@.gemini/skills/${s}/SKILL.md`).join('\n');
          if (!currentGeminiMd.includes(imports)) {
            await fs.writeFile(geminiMdPath, `${currentGeminiMd}\n\n# Migrated Skills\n${imports}\n`);
            reports.push('🔗 Added modular @imports to GEMINI.md');
          }
        } catch {
          // GEMINI.md might not exist
        }
      }
    }
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      reports.push(`❌ Error migrating skills: ${(error as Error).message}`);
    }
  }

  // 4. Migrate Custom Commands (.claude/commands/*.md -> .gemini/commands/*.toml)
  const claudeCommandsDir = path.join(cwd, '.claude', 'commands');
  const geminiCommandsDir = path.join(cwd, '.gemini', 'commands');

  try {
    const files = await fs.readdir(claudeCommandsDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length > 0) {
      await fs.mkdir(geminiCommandsDir, { recursive: true });

      for (const file of mdFiles) {
        const commandName = path.basename(file, '.md');
        const geminiCommandPath = path.join(geminiCommandsDir, `${commandName}.toml`);

        try {
          await fs.access(geminiCommandPath);
          continue;
        } catch {
          // Proceed
        }

        const content = await fs.readFile(path.join(claudeCommandsDir, file), 'utf-8');
        const translatedPrompt = content.replace(/\$ARGUMENTS/g, '{{args}}').trim();

        const tomlContent = `description = "Migrated from Claude Code: /${commandName}"\nprompt = """\n${translatedPrompt}\n"""\n`;
        await fs.writeFile(geminiCommandPath, tomlContent);
        stats.commandsCount++;
      }

      if (stats.commandsCount > 0) {
        migratedAny = true;
      }
    }
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      reports.push(`❌ Error migrating custom commands: ${(error as Error).message}`);
    }
  }

  // 5. Migrate Hooks (.claude/settings.json -> .gemini/settings.json)
  const claudeSettingsPath = path.join(cwd, '.claude', 'settings.json');
  try {
    const content = await fs.readFile(claudeSettingsPath, 'utf-8');
    const claudeSettings = parse(content) as any;

    if (claudeSettings.hooks) {
      const { settings } = context.services;
      if (settings) {
        const currentHooks = settings.merged.hooks || {};
        const newHooks = { ...currentHooks };

        const eventMap: Record<string, string> = {
          'PostToolUse': 'AfterTool',
          'PreToolUse': 'BeforeTool',
          'SessionStart': 'SessionStart',
        };

        const toolMap: Record<string, string> = {
          'Edit': 'replace',
          'Write': 'write_file',
          'Bash': 'run_shell_command',
          'Read': 'read_file',
          'Grep': 'grep_search',
          'Glob': 'glob',
        };

        for (const [claudeEvent, claudeHookList] of Object.entries(claudeSettings.hooks)) {
          const geminiEvent = eventMap[claudeEvent];
          if (!geminiEvent) continue;

          if (!(newHooks as any)[geminiEvent]) {
            (newHooks as any)[geminiEvent] = [];
          }

          for (const entry of (claudeHookList as any[])) {
            let translatedMatcher = entry.matcher;
            for (const [claudeTool, geminiTool] of Object.entries(toolMap)) {
              translatedMatcher = translatedMatcher.replace(new RegExp(`\\b${claudeTool}\\b`, 'g'), geminiTool);
            }

            const geminiEntry = {
              matcher: translatedMatcher,
              hooks: (entry.hooks || []).map((h: any) => ({
                type: h.type || 'command',
                command: h.command?.replace(/\$CLAUDE_/g, '$GEMINI_'),
              }))
            };
            
            const exists = ((newHooks as any)[geminiEvent] as any[]).some((existing: any) => 
              existing.matcher === geminiEntry.matcher && 
              JSON.stringify(existing.hooks) === JSON.stringify(geminiEntry.hooks)
            );

            if (!exists) {
              ((newHooks as any)[geminiEvent] as any[]).push(geminiEntry);
              stats.hooksCount++;
            }
          }
        }

        if (stats.hooksCount > 0) {
          settings.setValue(SettingScope.Workspace, 'hooks', newHooks);
          migratedAny = true;
        }
      }
    }
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      reports.push(`❌ Error migrating hooks: ${(error as Error).message}`);
    }
  }

  // 6. Scripts: Smart find-and-replace claude -> gemini
  try {
    const scripts = await fs.readdir(cwd);
    const bashScripts = scripts.filter(s => s.endsWith('.sh') || s.endsWith('.bash'));

    for (const script of bashScripts) {
      const scriptPath = path.join(cwd, script);
      const content = await fs.readFile(scriptPath, 'utf-8');
      
      if (content.includes('claude ')) {
        const updatedContent = content.replace(/claude\s/g, 'gemini --output-format json ');
        if (updatedContent !== content) {
          await fs.writeFile(scriptPath, updatedContent);
          stats.scriptsUpdated++;
        }
      }
    }

    if (stats.scriptsUpdated > 0) {
      migratedAny = true;
    }
  } catch {
    // Ignore
  }

  // 7. Permissions: Policy Engine Suggestion
  const claudeLocalSettingsPath = path.join(cwd, '.claude', 'settings.local.json');
  try {
    const content = await fs.readFile(claudeLocalSettingsPath, 'utf-8');
    const localSettings = parse(content) as any;

    if (localSettings.approvedCommands && localSettings.approvedCommands.length > 0) {
      const policyPath = path.join(cwd, '.gemini', 'suggested_policy.toml');
      let policyContent = '# Suggested policy migrated from Claude Code\n# Move this to ~/.gemini/policies/ to apply\n\n';
      
      for (const cmd of localSettings.approvedCommands) {
        policyContent += `[[rule]]\ntoolName = "run_shell_command"\ncommandPrefix = "${cmd}"\ndecision = "allow"\npriority = 100\n\n`;
      }

      await fs.writeFile(policyPath, policyContent);
      stats.policyGenerated = true;
      migratedAny = true;
    }
  } catch {
    // Skip
  }

  if (!migratedAny && reports.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No Claude Code artifacts found to migrate in this directory.',
    };
  }

  if (migratedAny) {
    const mcpAdded = stats.mcpCount > 0;
    if (mcpAdded) {
      const mcpClientManager = config.getMcpClientManager();
      if (mcpClientManager) {
        context.ui.addItem({ type: 'info', text: 'Restarting MCP servers to apply new configurations...' });
        await mcpClientManager.restart();
      }
    }
  }

  // Build the final summary message
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const summaryLines: string[] = [];
  
  if (stats.mdCloned) summaryLines.push('✅ Migrated CLAUDE.md into GEMINI.md');
  if (stats.mcpCount > 0) summaryLines.push(`✅ Connected ${stats.mcpCount} MCP Server(s) (${stats.mcpNames.join(', ')})`);
  if (stats.skillsCount > 0) summaryLines.push(`✅ Ported ${stats.skillsCount} skill(s) to .gemini/skills/`);
  if (stats.commandsCount > 0) summaryLines.push(`✅ Ported ${stats.commandsCount} custom slash command(s)`);
  if (stats.hooksCount > 0) summaryLines.push(`✅ Migrated ${stats.hooksCount} automated hook(s)`);
  if (stats.scriptsUpdated > 0) summaryLines.push(`✅ Updated ${stats.scriptsUpdated} script(s) with gemini --output-format json`);
  if (stats.policyGenerated) summaryLines.push('✅ Generated suggested policy in .gemini/suggested_policy.toml');
  
  summaryLines.push(...reports);

  const finalMessage = `
${summaryLines.map(l => `  - ${l}`).join('\n')}

🚀 **Migration complete in ${duration}s.**

💡 **Note:** We migrated automated hooks to \`.gemini/settings.json\`. You will see a standard security warning when these hooks are detected—this is normal for project-level automation.

💡 **Quick Tip:** In Gemini CLI, typing \`/exit\` or pressing \`Ctrl+C\` quits instantly. No hanging. We promise. 😉`;

  return {
    type: 'message',
    messageType: 'info',
    content: finalMessage.trim(),
  };
};

const claudeSubCommand: SlashCommand = {
  name: 'claude',
  description: 'Migrate Claude Code artifacts (CLAUDE.md, .claude.json) to Gemini',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: migrateClaudeAction,
};

export const migrateCommand: SlashCommand = {
  name: 'migrate',
  description: 'Migrate settings and context from other AI tools',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [claudeSubCommand],
  action: async () => ({
    type: 'message',
    messageType: 'info',
    content: 'Usage: /migrate claude',
  }),
};
