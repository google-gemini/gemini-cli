# Agent System Prompt Integration

## Summary

Updated the system prompt to dynamically inform the LLM about loaded
user-defined agents, encouraging their use for specialized tasks.

## Changes Made

### File: `packages/core/src/core/prompts.ts`

#### 1. Agent Discovery (lines 116-120)

Added code to discover all loaded agents:

```typescript
// Get all registered agents (excluding codebase_investigator which is handled separately)
const userAgents = config
  .getAgentRegistry()
  .getAllDefinitions()
  .filter((agent) => agent.name !== CodebaseInvestigatorAgent.name);
```

#### 2. New Prompt Section (lines 305-328)

Created a `specializedAgents` section that dynamically lists available agents:

```typescript
specializedAgents: `
${(function () {
  if (userAgents.length === 0) {
    return '';
  }

  const agentsList = userAgents
    .map((agent) => {
      const displayName = agent.displayName || agent.name;
      const icon = (agent as any).metadata?.icon || '🤖';
      return `- **${icon} ${displayName}** (\`${agent.name}\`): ${agent.description}`;
    })
    .join('\n');

  return `
## Specialized Agents

You have access to specialized agents for specific tasks. Consider using these agents when their domain matches the user's request:

${agentsList}

When a task clearly falls within an agent's domain of expertise, **prefer using that agent** rather than implementing the solution manually. These agents have been specifically configured with domain knowledge and appropriate tools.
`;
})()}`,
```

#### 3. Prompt Order Update (line 351)

Added `specializedAgents` to the ordered prompts list:

```typescript
orderedPrompts.push(
  'primaryWorkflows_suffix',
  'operationalGuidelines',
  'specializedAgents', // ← NEW
  'sandbox',
  'git',
  'finalReminder',
);
```

## How It Works

1. **Agent Discovery**: At prompt generation time, the system queries the
   AgentRegistry for all loaded agents
2. **Dynamic Listing**: Each agent is formatted with its icon, display name, and
   description
3. **Contextual Placement**: The specialized agents section appears after
   operational guidelines but before sandbox/git info
4. **Conditional**: If no user agents are loaded, the section is omitted
   entirely (empty string)

## Example Output

With a greeter agent and test_writer agent loaded, the system prompt will
include:

```markdown
## Specialized Agents

You have access to specialized agents for specific tasks. Consider using these
agents when their domain matches the user's request:

- **👋 Greeter** (`greeter`): A simple agent that provides friendly greetings
- **🧪 Test Writer** (`test_writer`): Generates comprehensive unit tests for
  code

When a task clearly falls within an agent's domain of expertise, **prefer using
that agent** rather than implementing the solution manually. These agents have
been specifically configured with domain knowledge and appropriate tools.
```

## Benefits

1. **Agent Awareness**: The LLM now knows which specialized agents are available
2. **Automatic Discovery**: No manual configuration needed - agents are
   discovered dynamically
3. **Clear Guidance**: The prompt explicitly encourages using agents for their
   specialized tasks
4. **Metadata Rich**: Includes icons and descriptions to help the LLM understand
   each agent's purpose
5. **Graceful Degradation**: If no agents are loaded, the section is omitted

## Testing

To verify the changes work:

1. Create an agent using `/new-agent "a test agent"`
2. Restart the CLI
3. Ask the LLM a question that matches the agent's domain
4. The LLM should now be aware of and preferentially use the specialized agent

## Related Files

- `packages/core/src/agents/registry.ts` - Agent registration
- `packages/core/src/agents/file-loader.ts` - Agent loading from TOML
- `packages/cli/src/ui/commands/agentsCommand.ts` - `/agents` command
- `~/.gemini/extensions/agent-creator/` - Agent creation extension
