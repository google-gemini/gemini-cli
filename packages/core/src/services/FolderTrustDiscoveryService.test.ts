/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { FolderTrustDiscoveryService } from './FolderTrustDiscoveryService.js';
import { GEMINI_DIR } from '../utils/paths.js';

describe('FolderTrustDiscoveryService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-discovery-test-'),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should discover commands, skills, mcps, and hooks', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });

    // Mock commands
    const commandsDir = path.join(geminiDir, 'commands');
    await fs.mkdir(commandsDir);
    await fs.writeFile(
      path.join(commandsDir, 'test-cmd.toml'),
      'prompt = "test"',
    );

    // Mock skills
    const skillsDir = path.join(geminiDir, 'skills');
    await fs.mkdir(path.join(skillsDir, 'test-skill'), { recursive: true });
    await fs.writeFile(path.join(skillsDir, 'test-skill', 'SKILL.md'), 'body');

    // Mock agents
    const agentsDir = path.join(geminiDir, 'agents');
    await fs.mkdir(agentsDir);
    await fs.writeFile(path.join(agentsDir, 'test-agent.md'), 'body');

    // Mock settings (MCPs, Hooks, and general settings)
    const settings = {
      mcpServers: {
        'test-mcp': { command: 'node', args: ['test.js'] },
      },
      hooks: {
        BeforeTool: [{ command: 'test-hook' }],
      },
      general: { vimMode: true },
      ui: { theme: 'Dark' },
    };
    await fs.writeFile(
      path.join(geminiDir, 'settings.json'),
      JSON.stringify(settings),
    );

    const results = await FolderTrustDiscoveryService.discover(tempDir);

    expect(results.commands).toContain('test-cmd');
    expect(results.skills).toContain('test-skill');
    expect(results.agents).toContain('test-agent');
    expect(results.mcps).toContain('test-mcp');
    expect(results.hooks).toContain('test-hook');
    expect(results.settings).toContain('general');
    expect(results.settings).toContain('ui');
    expect(results.settings).not.toContain('mcpServers');
    expect(results.settings).not.toContain('hooks');
  });

  it('should flag security warnings for sensitive settings', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });

    const settings = {
      tools: {
        allowed: ['git'],
        sandbox: false,
      },
      security: {
        folderTrust: {
          enabled: false,
        },
      },
    };
    await fs.writeFile(
      path.join(geminiDir, 'settings.json'),
      JSON.stringify(settings),
    );

    const results = await FolderTrustDiscoveryService.discover(tempDir);

    expect(results.securityWarnings).toContain(
      'This project auto-approves certain tools (tools.allowed).',
    );
    expect(results.securityWarnings).toContain(
      'This project attempts to disable folder trust (security.folderTrust.enabled).',
    );
    expect(results.securityWarnings).toContain(
      'This project disables the security sandbox (tools.sandbox).',
    );
  });

  it('should handle missing .gemini directory', async () => {
    const results = await FolderTrustDiscoveryService.discover(tempDir);
    expect(results.commands).toHaveLength(0);
    expect(results.skills).toHaveLength(0);
    expect(results.mcps).toHaveLength(0);
    expect(results.hooks).toHaveLength(0);
    expect(results.settings).toHaveLength(0);
  });

  it('should handle malformed settings.json', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });
    await fs.writeFile(path.join(geminiDir, 'settings.json'), 'invalid json');

    const results = await FolderTrustDiscoveryService.discover(tempDir);
    expect(results.discoveryErrors[0]).toContain(
      'Failed to discover settings: Unexpected token',
    );
  });

  it('should handle null settings.json', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });
    await fs.writeFile(path.join(geminiDir, 'settings.json'), 'null');

    const results = await FolderTrustDiscoveryService.discover(tempDir);
    expect(results.discoveryErrors).toHaveLength(0);
    expect(results.settings).toHaveLength(0);
  });

  it('should handle array settings.json', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });
    await fs.writeFile(path.join(geminiDir, 'settings.json'), '[]');

    const results = await FolderTrustDiscoveryService.discover(tempDir);
    expect(results.discoveryErrors).toHaveLength(0);
    expect(results.settings).toHaveLength(0);
  });

  it('should handle string settings.json', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });
    await fs.writeFile(path.join(geminiDir, 'settings.json'), '"string"');

    const results = await FolderTrustDiscoveryService.discover(tempDir);
    expect(results.discoveryErrors).toHaveLength(0);
    expect(results.settings).toHaveLength(0);
  });

  it('should flag security warning for custom agents', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });

    const agentsDir = path.join(geminiDir, 'agents');
    await fs.mkdir(agentsDir);
    await fs.writeFile(path.join(agentsDir, 'test-agent.md'), 'body');

    const results = await FolderTrustDiscoveryService.discover(tempDir);

    expect(results.agents).toContain('test-agent');
    expect(results.securityWarnings).toContain(
      'This project contains custom agents.',
    );
  });

  it('should discover hooks and skills in an extension root using default directories', async () => {
    await fs.writeFile(
      path.join(tempDir, 'gemini-extension.json'),
      JSON.stringify({
        name: 'default-extension',
        version: '1.0.0',
      }),
    );

    const skillsDir = path.join(tempDir, 'skills');
    await fs.mkdir(path.join(skillsDir, 'test-skill'), { recursive: true });
    await fs.writeFile(path.join(skillsDir, 'test-skill', 'SKILL.md'), 'body');

    const hooksDir = path.join(tempDir, 'hooks');
    await fs.mkdir(hooksDir, { recursive: true });
    await fs.writeFile(
      path.join(hooksDir, 'hooks.json'),
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'default-hook',
                },
              ],
            },
          ],
        },
      }),
    );

    const results = await FolderTrustDiscoveryService.discover(tempDir);

    expect(results.skills).toContain('test-skill');
    expect(results.hooks).toContain('default-hook');
  });

  it('should discover hooks and skills in an extension root using custom directories', async () => {
    await fs.writeFile(
      path.join(tempDir, 'gemini-extension.json'),
      JSON.stringify({
        name: 'custom-extension',
        version: '1.0.0',
        hooksDir: 'claude-hooks',
        skillsDir: 'claude-skills',
      }),
    );

    const skillsDir = path.join(tempDir, 'claude-skills');
    await fs.mkdir(path.join(skillsDir, 'test-skill'), { recursive: true });
    await fs.writeFile(path.join(skillsDir, 'test-skill', 'SKILL.md'), 'body');

    const hooksDir = path.join(tempDir, 'claude-hooks');
    await fs.mkdir(hooksDir, { recursive: true });
    await fs.writeFile(
      path.join(hooksDir, 'hooks.json'),
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'custom-hook',
                },
              ],
            },
          ],
        },
      }),
    );

    const results = await FolderTrustDiscoveryService.discover(tempDir);

    expect(results.skills).toContain('test-skill');
    expect(results.hooks).toContain('custom-hook');
  });

  it('should preserve hooks discovered from settings and extension manifests', async () => {
    const geminiDir = path.join(tempDir, GEMINI_DIR);
    await fs.mkdir(geminiDir, { recursive: true });
    await fs.writeFile(
      path.join(geminiDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          BeforeTool: [{ command: 'project-hook' }],
        },
        // Keep settings parsing noticeably slower than extension hook discovery
        // to consistently exercise concurrent merge behavior.
        metadata: 'x'.repeat(5_000_000),
      }),
    );

    await fs.writeFile(
      path.join(tempDir, 'gemini-extension.json'),
      JSON.stringify({
        name: 'combined-hooks-extension',
        version: '1.0.0',
      }),
    );
    const hooksDir = path.join(tempDir, 'hooks');
    await fs.mkdir(hooksDir, { recursive: true });
    await fs.writeFile(
      path.join(hooksDir, 'hooks.json'),
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'extension-hook',
                },
              ],
            },
          ],
        },
      }),
    );

    const results = await FolderTrustDiscoveryService.discover(tempDir);

    expect(results.hooks).toContain('project-hook');
    expect(results.hooks).toContain('extension-hook');
  });
});
