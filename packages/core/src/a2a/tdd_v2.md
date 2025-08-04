# TDD Plan v2: Decoupled Dynamic Tool Registration

## 1. Objective

Refactor the A2A MCP server to dynamically register a unique, agent-specific set of tools (e.g., `agentName_sendMessage`) for each agent loaded via `load_agent`. This revised plan introduces a dedicated registry class to improve separation of concerns and create a more robust, maintainable architecture.

## 2. "Greenfield" Architecture Proposal

The core of this improved design is to introduce a dedicated **`A2AToolRegistry`** class whose single responsibility is to manage the lifecycle of dynamic tools, decoupling the tool implementation logic from the registration mechanism.

### Component Responsibilities

1.  **`McpServer` (in `a2a-mcp-server.ts`)**: Its role is unchanged. It remains the core server that runs the transport and holds the tool definitions.

2.  **`A2AToolRegistry` (New Class)**:
    - **Responsibility**: The single source of truth for dynamic tool registration. It knows _how_ to talk to the `McpServer` to add or remove tools.
    - **Dependencies**: It will take the `McpServer` instance in its constructor.
    - **Methods**:
      - `registerToolsForAgent(agentCard: AgentCard)`: Contains the logic to create and register the `agentName_sendMessage`, `agentName_getTask`, etc., tools with the `McpServer`.
      - `unregisterToolsForAgent(agentName: string)`: (Future-proofing) A placeholder for cleanly unloading an agent and its tools.

3.  **`A2AToolFunctions` (in `tools.ts`)**:
    - **Responsibility**: Becomes much simpler. It is only responsible for implementing the _business logic_ of the static tools (`load_agent`, `list_agents`). It should not know the implementation details of how new tools are registered.
    - **Dependencies**: It will take the `A2AToolRegistry` in its constructor, _not_ the `McpServer` directly.
    - **Methods**:
      - `load_agent()`: After successfully loading an agent, it will delegate the registration task by calling `this.registry.registerToolsForAgent(agentCard)`.
      - `list_agents()`: Unchanged.

4.  **`A2AClientManager` (in `a2a-client.ts`)**: Unchanged. Its responsibility is purely to manage the low-level client connections to A2A agents.

## 3. Step-by-Step Implementation Plan

### Step 1: Refactor `tools.ts`

1.  **Create `A2AToolRegistry`**: Implement the new class. It will contain the logic for creating and registering the agent-specific tools.

    ```typescript
    // In tools.ts
    import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
    import { AgentCard } from '@a2a-js/sdk';

    // ... (Zod schemas will be updated/created here)

    export class A2AToolRegistry {
      constructor(
        private server: McpServer,
        private clientManager: A2AClientManager
      ) {}

      registerToolsForAgent(agentCard: AgentCard): void {
        const agentName = agentCard.name;

        // Register send_message for the agent
        this.server.registerTool(`${agentName}_sendMessage`, { ... });

        // Register get_task for the agent
        this.server.registerTool(`${agentName}_getTask`, { ... });

        // Register cancel_task for the agent
        this.server.registerTool(`${agentName}_cancelTask`, { ... });
      }
    }
    ```

2.  **Update Input Schemas**: Create new, simpler Zod schemas for the agent-specific tools that do not require the `agent_name` field.

    ```typescript
    // In tools.ts
    export const AgentSendMessageInputSchema = z.object({
      message: z.string().describe('The text message to send to the agent.'),
    });
    // ... other agent-specific schemas
    ```

3.  **Simplify `A2AToolFunctions`**: Refactor the class to delegate registration logic to the new registry.

    ```typescript
    // In tools.ts
    export class A2AToolFunctions {
      constructor(
        private registry: A2AToolRegistry,
        private clientManager: A2AClientManager,
      ) {}

      async load_agent(
        args: z.infer<typeof LoadAgentInputSchema>,
      ): Promise<CallToolResult> {
        const { url, agent_card_path } = args;
        try {
          const agentCard = await this.clientManager.loadAgent(
            url,
            agent_card_path,
          );

          // Delegate registration
          this.registry.registerToolsForAgent(agentCard);

          const output = `Successfully loaded agent: ${agentCard.name}. New tools registered.`;
          return textResponse(output);
        } catch (error) {
          // ... error handling
        }
      }

      async list_agents(): Promise<CallToolResult> {
        // ... unchanged
      }
    }
    ```

4.  **Cleanup**: Remove the obsolete generic `send_message`, `get_task`, and `cancel_task` methods and their corresponding schemas from `tools.ts`.

### Step 2: Modify `a2a-mcp-server.ts`

1.  **Update `main()`**: Instantiate the new registry and inject it into `A2AToolFunctions`.

    ```typescript
    // In a2a-mcp-server.ts
    async function main() {
      const server = new McpServer({...});
      const clientManager = A2AClientManager.getInstance();
      const registry = new A2AToolRegistry(server, clientManager);
      const toolImplementations = new A2AToolFunctions(registry, clientManager);

      // Register ONLY the static tools
      server.registerTool(
        'load_agent',
        {...},
        toolImplementations.load_agent.bind(toolImplementations)
      );
      server.registerTool(
        'list_agents',
        {...},
        toolImplementations.list_agents.bind(toolImplementations)
      );

      const transport = new StdioServerTransport();
      await server.connect(transport);
    }
    ```

2.  **Cleanup**: Ensure the old static registrations for `send_message`, `get_task`, and `cancel_task` are removed.

This architecture provides better separation of concerns, making the system more modular, testable, and easier to maintain.
