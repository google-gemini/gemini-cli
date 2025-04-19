import { describe, it, expect } from 'vitest';
import { toolRegistry } from './tools/tool-registry.js';

describe('cli tests', () => {
  it('should have a tool registry', () => {
    expect(toolRegistry).toBeDefined();
    expect(typeof toolRegistry.registerTool).toBe('function');
  });
});
