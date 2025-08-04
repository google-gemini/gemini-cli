# CLI A2A MCP Server Integration Plan (v2)

## 1. Objective

Integrate the A2A MCP server into the Gemini CLI's startup process _conditionally_. The server should only be started if the user has defined one or more A2A agents in their `settings.json`. This integration will follow the dynamic injection pattern used by the IDE companion server.

## 2. Architectural Model: The IDE Companion Pattern

The existing IDE integration provides the perfect blueprint:

1.  **Detect Configuration**: Instead of detecting a port, we will detect the presence of a specific `a2aServers` key in the user's configuration.
2.  **Dynamically Inject**: If the configuration exists, we will programmatically create and inject the `MCPServerConfig` for our A2A server into the list of servers to be discovered.
3.  **Standard Discovery**: The standard `discoverMcpTools` process will then handle the server just like any other, connecting to it and registering its tools.

This approach is superior because it avoids running an unnecessary process if the user isn't using the A2A feature.

## 3. Step-by-Step Implementation Plan

### Step 1: Define the `a2aServers` Configuration Schema

1.  **Update `packages/cli/src/config/settings.ts`**:
    - Add a new optional property `a2aServers` to the `Settings` interface. This will be the trigger for our logic.

    ```typescript
    export interface A2AServerConfig {
      url: string;
      accessToken?: string;
      agent_card_path?: string;
    }

    export interface Settings {
      // ... existing properties
      a2aServers?: A2AServerConfig[];
    }
    ```

2.  **Update `packages/core/src/config/config.ts`**:
    - Add a corresponding `a2aServers` property to the `Config` class and a getter method `getA2AServers()` to make it accessible throughout the application.

### Step 2: Implement Conditional Injection of the A2A Server

This is the core of the new plan. We will modify the configuration loading process to dynamically add our A2A server.

1.  **Modify `packages/cli/src/config/config.ts`**:
    - Locate the logic where the final `mcpServers` configuration is assembled (likely near `mergeMcpServers` or where the `Config` object is instantiated).
    - Add a new step in this process:
      a. After the settings are fully loaded and merged, check if `settings.a2aServers` exists and has a length greater than 0.
      b. **If it does**, create a new `MCPServerConfig` object for the A2A server.
      c. Serialize the `a2aServers` array into a JSON string.
      d. Add this JSON string as a command-line argument (`--agents`) to the `args` property of the new `MCPServerConfig`.
      e. Inject this new config object into the `mcpServers` map under the key `'a2a-server'`.

    ```typescript
    // Conceptual logic in packages/cli/src/config/config.ts

    // After loading settings...
    const mcpServers = mergeMcpServers(settings, activeExtensions);
    const a2aServers = settings.a2aServers;

    if (a2aServers && a2aServers.length > 0) {
      if (!mcpServers['a2a-server']) {
        // Avoid overwriting if user defined manually
        mcpServers['a2a-server'] = {
          description: 'Handles communication with A2A-compatible agents.',
          command: 'node',
          args: [
            './packages/core/dist/a2a/a2a-mcp-server.js',
            '--agents',
            JSON.stringify(a2aServers),
          ],
          cwd: './', // Relative to project root
        };
      }
    }

    // The final Config object will now be created with this potentially modified mcpServers map.
    ```

### Step 3: Update the A2A MCP Server to Load Agents on Startup

The A2A server itself needs to be able to receive the `--agents` argument and act on it.

1.  **Modify `packages/core/src/a2a/a2a-mcp-server.ts`**:
    - In the `main()` function, use a simple argument parser (or `process.argv`) to find and parse the JSON string from the `--agents` flag.
    - Before connecting the transport, iterate through the parsed agent configurations.
    - For each agent, `await` a call to `toolImplementations.load_agent()`. This pre-loads all agents and registers their tools _before_ the CLI connects, ensuring all tools are available immediately upon discovery.

    ```typescript
    // In a2a-mcp-server.ts main()
    // ... after server and toolImplementations are created

    const args = process.argv.slice(2);
    const agentFlagIndex = args.indexOf('--agents');

    if (agentFlagIndex !== -1 && args[agentFlagIndex + 1]) {
      const agentConfigs: A2AServerConfig[] = JSON.parse(
        args[agentFlagIndex + 1],
      );

      console.log(
        `A2A Server: Found ${agentConfigs.length} agents to auto-load.`,
      );

      const loadingPromises = agentConfigs.map((agent) => {
        console.log(`A2A Server: Auto-loading agent from ${agent.url}`);
        // Note: accessToken is not used yet, but is available for future use.
        return toolImplementations.load_agent({ url: agent.url });
      });

      await Promise.all(loadingPromises);
      console.log('A2A Server: All agents loaded.');
    }

    // Connect to the CLI
    const transport = new StdioServerTransport();
    await server.connect(transport);
    ```

This revised plan is more efficient, robust, and consistent with the existing architectural patterns of the Gemini CLI.
