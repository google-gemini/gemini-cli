import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';

export interface CustomSlashCommand {
  name: string;
  description: string;
  allowedTools?: string;
  template: string;
  filePath: string;
}

export async function loadCustomSlashCommands(): Promise<CustomSlashCommand[]> {
  const commandDirs = [
    path.join(process.cwd(), '.gemini', 'commands'),
    path.join(process.env.HOME || '', '.gemini', 'commands'),
  ];
  const commands: CustomSlashCommand[] = [];
  for (const dir of commandDirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(dir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
          let meta: Record<string, any> = {}, body = content;
          if (match) {
            meta = yaml.parse(match[1]) as Record<string, any>;
            body = match[2];
          }
          commands.push({
            name: `project:${file.replace(/\.md$/, '')}`,
            description: meta['description'] || '',
            allowedTools: meta['allowed-tools'],
            template: body,
            filePath,
          });
        }
      }
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as any).code === 'ENOENT') {
        continue;
      }
      console.error(`Could not load custom commands from ${dir}:`, e);
    }
  }
  return commands;
}