# TDD Plan: Dynamic MCP Tool Registration for A2A Agents

## 1. Objective

Refactor the A2A MCP server to dynamically register a unique, agent-specific set of tools (e.g., `agentName_sendMessage`, `agentName_getTask`) for each agent that is loaded via the `load_agent` tool. This moves away from the current model of generic tools that require an `agent_name` parameter for each call.

## 2. Current Architecture Analysis

- **`a2a-mcp-server.ts`**: Creates a single `McpServer` instance and statically registers a fixed set of tools (`load_agent`, `list_agents`, `send_message`, `get_task`, `cancel_task`) at startup.
- **`tools.ts`**: The `A2AToolFunctions` class implements the logic for these tools. Methods like `send_message` and `get_task` take an `agent_name` argument to specify the target agent.
- **`a2a-client.ts`**: The `A2AClientManager` singleton stores the mapping of loaded agent names to their `A2AClient` instances.

The current design is static. The proposed change requires a dynamic approach where the set of available tools changes at runtime.

## 3. Proposed Architecture & Step-by-Step Plan

The core idea is to make the `load_agent` tool responsible for not only loading an agent's data but also for registering its specific toolset with the MCP server.

### Step 1: Modify `a2a-mcp-server.ts` to Enable Dynamic Registration

The `A2AToolFunctions` class, which implements `load_agent`, needs a reference to the `McpServer` instance to be able to register new tools. We will use dependency injection.

1.  In `main()`, after creating the `server` instance, pass it to the `A2AToolFunctions` constructor:
    ```typescript
    // In a2a-mcp-server.ts
    const server = new McpServer({...});
    const toolImplementations = new A2AToolFunctions(server); // Pass server instance
    ```
2.  Remove the static registration for `send_message`, `get_task`, and `cancel_task`. The server will now only start with `load_agent` and `list_agents`.

    ```typescript
    // In a2a-mcp-server.ts
    server.registerTool('load_agent', ...);
    server.registerTool('list_agents', ...);
    // REMOVE server.registerTool('send_message', ...);
    // REMOVE server.registerTool('get_task', ...);
    // REMOVE server.registerTool('cancel_task', ...);
    ```

### Step 2: Refactor `tools.ts` to Handle Tool Creation

This file will see the most significant changes. `A2AToolFunctions` will now act as a factory for agent-specific tools.

1.  **Update the Constructor**: Modify the `A2AToolFunctions` class to accept and store the `McpServer` instance.

    ```typescript
    // In tools.ts
    import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

    export class A2AToolFunctions {
      private clientManager = A2AClientManager.getInstance();

      constructor(private server: McpServer) {} // Add constructor

      // ... other methods
    }
    ```

2.  **Update Input Schemas**: The new agent-specific tools won't need the `agent_name` field. We'll create new, simpler Zod schemas.

    ```typescript
    // In tools.ts

    // New schema for agent-specific send_message
    export const AgentSendMessageInputSchema = z.object({
      message: z.string().describe('The text message to send to the agent.'),
    });

    // New schema for agent-specific get_task
    export const AgentGetTaskInputSchema = z.object({
      taskId: z.string().describe('The ID of the task to query.'),
    });

    // New schema for agent-specific cancel_task
    export const AgentCancelTaskInputSchema = z.object({
      taskId: z.string().describe('The ID of the task to cancel.'),
    });
    ```

3.  **Enhance `load_agent`**: After successfully loading an agent, it will now call a new private method to register the tools for that agent.

    ```typescript
    // In tools.ts
    async load_agent(args: z.infer<typeof LoadAgentInputSchema>): Promise<CallToolResult> {
      const { url, agent_card_path } = args;
      try {
        const agentCard = await this.clientManager.loadAgent(url, agent_card_path);
        
        // New step: Register tools for this agent
        this.registerAgentTools(agentCard.name);

        const output = `Successfully loaded agent: ${agentCard.name}. New tools registered: ${agentCard.name}_sendMessage, ${agentCard.name}_getTask, ${agentCard.name}_cancelTask.`;
        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to load agent: ${error}`);
      }
    }
    ```

4.  **Create the Dynamic Registration Method**: Add a new `registerAgentTools` method to the class. This method will define and register the full set of tools for a given agent name.

    ```typescript
    // In tools.ts
    private registerAgentTools(agentName: string): void {
      // Register send_message for the agent
      this.server.registerTool(
        `${agentName}_sendMessage`,
        {
          description: `Sends a message to the ${agentName} agent.`,
          inputSchema: AgentSendMessageInputSchema.shape,
        },
        async (args: z.infer<typeof AgentSendMessageInputSchema>) => {
          return textResponse(
            await this.clientManager.sendMessage(agentName, args.message)
          );
        }
      );

      // Register get_task for the agent
      this.server.registerTool(
        `${agentName}_getTask`,
        {
          description: `Retrieves a task from the ${agentName} agent.`,
          inputSchema: AgentGetTaskInputSchema.shape,
        },
        async (args: z.infer<typeof AgentGetTaskInputSchema>) => {
          // Note: Implementation for get_task is currently a placeholder
          return textResponse(
            `'get_task' is not yet implemented for ${agentName}. Task ID: ${args.taskId}`
          );
        }
      );

      // Register cancel_task for the agent
      this.server.registerTool(
        `${agentName}_cancelTask`,
        {
          description: `Cancels a task on the ${agentName} agent.`,
          inputSchema: AgentCancelTaskInputSchema.shape,
        },
        async (args: z.infer<typeof AgentCancelTaskInputSchema>) => {
          // Note: Implementation for cancel_task is currently a placeholder
          return textResponse(
            `'cancel_task' is not yet implemented for ${agentName}. Task ID: ${args.taskId}`
          );
        }
      );
    }
    ```

5.  **Cleanup**: Remove the now-obsolete generic `send_message`, `get_task`, and `cancel_task` methods from the `A2AToolFunctions` class.

### Step 3: `a2a-client.ts`

No changes are required in this file. Its responsibility remains managing agent connections, which is correctly decoupled from the MCP tool server logic.

## 4. Summary of Changes

-   **From**: Static tools (`send_message`) requiring `agent_name`.
-   **To**: Dynamic tools (`<agent_name>_sendMessage`) created by `load_agent`, with `agent_name` baked into their context.
-   **Mechanism**: Pass the `McpServer` instance into `A2AToolFunctions` so it can call `registerTool` at runtime.

This approach is clean, modular, and directly addresses the request. Please review this plan, and if it meets your approval, I will proceed with the implementation.
