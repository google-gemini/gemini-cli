import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { loadCustomSlashCommands } from './useCustomSlashCommand.js';

vi.mock('fs/promises');
vi.mock('js-yaml');

describe('loadCustomSlashCommands', () => {
  const mockReaddir = vi.mocked(fs.readdir);
  const mockReadFile = vi.mocked(fs.readFile);
  const mockYamlLoad = vi.mocked(yaml.load);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads and parses custom slash commands from markdown files', async () => {
    mockReaddir.mockResolvedValueOnce(['hello.md']);
    mockReadFile.mockResolvedValueOnce(
      `---
description: "Test hello command"
allowed-tools: "none"
---
Translate $ARGUMENTS to English`
    );
    mockYamlLoad.mockReturnValueOnce({
      description: 'Test hello command',
      'allowed-tools': 'none',
    });

    // Second dir is empty
    mockReaddir.mockResolvedValueOnce([]);

    const commands = await loadCustomSlashCommands();

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      name: 'project:hello',
      description: 'Test hello command',
      allowedTools: 'none',
      template: 'Translate $ARGUMENTS to English',
    });
    expect(commands[0].filePath).toContain(path.join('.gemini', 'commands', 'hello.md'));
  });

  it('ignores non-md files', async () => {
    mockReaddir.mockResolvedValueOnce(['not_a_command.txt']);
    mockReaddir.mockResolvedValueOnce([]);
    const commands = await loadCustomSlashCommands();
    expect(commands).toHaveLength(0);
  });

  it('handles missing directories gracefully', async () => {
    mockReaddir.mockRejectedValueOnce(new Error('no such dir'));
    mockReaddir.mockResolvedValueOnce([]);
    const commands = await loadCustomSlashCommands();
    expect(commands).toHaveLength(0);
  });

  it('parses files without frontmatter as plain template', async () => {
    mockReaddir.mockResolvedValueOnce(['plain.md']);
    mockReadFile.mockResolvedValueOnce('just a template');
    mockReaddir.mockResolvedValueOnce([]);
    const commands = await loadCustomSlashCommands();
    expect(commands[0]).toMatchObject({
      name: 'project:plain',
      description: '',
      template: 'just a template',
    });
  });
});