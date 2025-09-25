/**
 * MCP Ecosystem Demo - Shows the intelligent plugin system in action
 */

import { IntelligentMCPEcosystem } from './mcp_plugin_system.js';
import { VirtualFileSystem } from './fileSystemService.js';
import { GuidanceSystem } from './guidance.js';

// Initialize the ecosystem
async function demoMCPEcosystem() {
  console.log('🚀 Initializing Intelligent MCP Ecosystem...\n');

  // Create core systems
  const vfs = new VirtualFileSystem(null, {
    maxCacheSize: 100 * 1024 * 1024, // 100MB
    cacheTTL: 5 * 60 * 1000, // 5 minutes
    maxCacheEntries: 1000,
    conflictResolution: 'merge',
    enableLogging: true,
    syncInterval: 30 * 1000
  });

  const guidance = new GuidanceSystem();
  const ecosystem = new IntelligentMCPEcosystem(vfs, guidance);

  console.log('✅ Ecosystem initialized with:');
  console.log('   - Virtual File System with intelligent caching');
  console.log('   - Guidance.js for intelligent analysis');
  console.log('   - MCP Plugin Manager');
  console.log('   - Context Sync Manager');
  console.log('   - Prompt Context Integrator\n');

  // Demo 1: Process a complex query
  console.log('📝 Demo 1: Processing complex query with agent context...\n');

  const query = `
    I need to refactor this legacy code to use modern async/await patterns.
    The code currently uses callbacks and promises mixed together.
    Can you help me identify the best patterns and create a refactored version?
  `;

  // First, spawn a specialized code analysis agent
  console.log('🤖 Spawning specialized code analysis agent...');
  const analysisAgentId = await ecosystem.spawnSpecializedAgent(
    'code_generation',
    'legacy_code_refactoring',
    'mcp-code-assist'
  );
  console.log(`✅ Spawned agent: ${analysisAgentId}\n`);

  // Process the query with context from the analysis agent
  console.log('🔄 Processing query with agent context...');
  const response = await ecosystem.processQuery(query, [analysisAgentId]);
  console.log(`📤 Response: ${response}\n`);

  // Demo 2: Spawn multiple specialized agents for different tasks
  console.log('📝 Demo 2: Spawning multiple specialized agents...\n');

  const agents = await Promise.all([
    ecosystem.spawnSpecializedAgent('analysis', 'performance_optimization', 'mcp-performance'),
    ecosystem.spawnSpecializedAgent('conflict_resolution', 'merge_conflicts', 'mcp-git-assist'),
    ecosystem.spawnSpecializedAgent('code_generation', 'api_design', 'mcp-api-designer')
  ]);

  console.log('✅ Spawned agents:');
  agents.forEach((agentId, index) => {
    const types = ['performance', 'conflict_resolution', 'code_generation'];
    console.log(`   ${index + 1}. ${types[index]} agent: ${agentId}`);
  });
  console.log();

  // Demo 3: Show plugin capabilities
  console.log('📝 Demo 3: Displaying plugin capabilities...\n');

  const capabilities = ecosystem.getPluginCapabilities();
  console.log('🔌 Available Plugins:');
  for (const [pluginId, pluginCapabilities] of capabilities) {
    console.log(`   ${pluginId}:`);
    pluginCapabilities.forEach(cap => {
      console.log(`     - ${cap.type}: ${cap.methods.join(', ')}`);
    });
  }
  console.log();

  // Demo 4: Process a collaborative task
  console.log('📝 Demo 4: Processing collaborative task across multiple agents...\n');

  const collabQuery = `
    We're building a microservices architecture. I need to:
    1. Design API contracts between services
    2. Set up async communication patterns
    3. Handle distributed transactions
    4. Implement service discovery

    Can the team help design this architecture?
  `;

  console.log('🔄 Processing collaborative query...');
  const collabResponse = await ecosystem.processQuery(collabQuery, agents);
  console.log(`📤 Collaborative response: ${collabResponse}\n`);

  // Demo 5: Show active agents and sync status
  console.log('📝 Demo 5: System status...\n');

  const activeAgents = ecosystem.getActiveAgents();
  console.log(`🤖 Active Agents: ${activeAgents.length}`);
  activeAgents.forEach(agentId => {
    console.log(`   - ${agentId}`);
  });
  console.log();

  console.log('🎉 MCP Ecosystem Demo Complete!');
  console.log('💡 The system now has:');
  console.log('   - Self-organizing plugin ecosystem');
  console.log('   - Real-time context synchronization');
  console.log('   - Persistent memory in VFS');
  console.log('   - Intelligent agent spawning');
  console.log('   - Prompt integration with context');
  console.log('   - MCP-Plugin bidirectional management');
}

// Run the demo
demoMCPEcosystem().catch(console.error);
