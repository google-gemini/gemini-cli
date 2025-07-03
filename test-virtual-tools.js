#!/usr/bin/env node

// Test script to check virtual tool discovery
import { ToolRegistry } from './packages/core/dist/src/tools/tool-registry.js';
import { Config } from './packages/core/dist/src/config/config.js';

async function testVirtualTools() {
  console.log('Creating test config...');
  const config = new Config({
    sessionId: 'test',
    targetDir: '../llmunix',
    debugMode: true,
    cwd: process.cwd(),
    model: 'gemini-1.5-flash'
  });

  console.log('Creating tool registry...');
  const registry = new ToolRegistry(config);
  
  console.log('Discovering virtual tools...');
  await registry.discoverVirtualTools();
  
  console.log('Done!');
}

testVirtualTools().catch(console.error);