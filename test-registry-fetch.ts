import { AgentRegistry } from '@google/gemini-cli-core/dist/agents/registry.js';
import { Config } from '@google/gemini-cli-core/dist/config/config.js';

async function run() {
    process.env.USE_CCPA = '1';
    process.env.GEMINI_YOLO_MODE = 'true';
    process.env.GEMINI_FOLDER_TRUST = 'true';
    process.env.CODER_AGENT_WORKSPACE_PATH = process.cwd();

    // We want to see if the registry successfully fetches the agent-card for 'researcher'
    const mockAgentFile = `${process.env.HOME}/.ilhae/team-workspaces/leader/.gemini/agents/researcher.md`;
    console.log(`Setting up to load mock workspace: ${process.env.HOME}/.ilhae/team-workspaces/leader`);
    process.env.GEMINI_CLI_HOME = `${process.env.HOME}/.ilhae/team-workspaces/leader`;

    const config = await Config.getInstance();
    await config.initialize();

    const registry = new AgentRegistry(config);
    await registry.initialize();

    const agents = registry.getAllDefinitions();
    console.log("Registered Agents:");
    for (const agent of agents) {
        console.log(`- ${agent.name} (${agent.kind})`);
        if (agent.kind === 'remote') {
            console.log(`  description: ${agent.description.slice(0, 50)}...`);
            console.log(`  agentCardUrl: ${agent.agentCardUrl}`);
        }
    }
}

run().catch(console.error);
