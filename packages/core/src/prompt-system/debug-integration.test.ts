import { describe, it, expect } from 'vitest';
import { ModuleLoaderImpl } from './ModuleLoader';
import * as path from 'node:path';

describe('Debug Integration', () => {
  it('should debug module loading paths', async () => {
    console.log('Current working directory:', process.cwd());
    console.log('__dirname:', __dirname);

    // Test with explicit path
    const explicitPath = path.join(__dirname);
    console.log('Explicit path:', explicitPath);

    const moduleLoader = new ModuleLoaderImpl(explicitPath);

    try {
      const modules = await moduleLoader.loadAllModules();
      console.log(`Loaded ${modules.length} modules from ${explicitPath}`);

      if (modules.length > 0) {
        console.log('First module:', modules[0]);
      }

      expect(modules.length).toBeGreaterThan(0);
    } catch (error) {
      console.error('Module loading failed:', error);
      console.log('Trying to list directory contents...');

      // Try to see what's in the directory
      try {
        const fs = await import('node:fs/promises');
        const contents = await fs.readdir(explicitPath);
        console.log('Directory contents:', contents);

        // Check subdirectories
        for (const item of contents) {
          const itemPath = path.join(explicitPath, item);
          try {
            const stat = await fs.stat(itemPath);
            if (stat.isDirectory()) {
              const subContents = await fs.readdir(itemPath);
              console.log(`${item}/: ${subContents.join(', ')}`);
            }
          } catch (e) {
            console.log(`Cannot read ${item}: ${e.message}`);
          }
        }
      } catch (e) {
        console.error('Cannot list directory:', e);
      }

      throw error;
    }
  });
});
