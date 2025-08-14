import { createTool } from '@mastra/core';
import { z } from 'zod';
import {
  Neo4jStore,
  Neo4jConfigSchema,
  Neo4jQueryResultSchema,
  Neo4jSchemaResultSchema,
} from './shared-neo4j-store.js';

export const ekgCrudTool = createTool({
  id: 'ekg-database',
  description:
    'Read the Engineering Knowledge Graph (EKG) stored in Neo4j. Use cypher query language to do schema inspection, read or and write. EKG contains entities and their relationships, created through pattern matching and semantic analysis of the code repo and cloud specs.\n\n**Key entities:** code repositories, artifacts (containers/binaries), services (frontend/backend apps), resources (databases, compute, storage etc), tools (lint, monitor, test, security etc), CI/CD pipelines, users/groups, and environments.\n\n**Key relationships:** Path-to-production flows (code→artifact→service→environment), service to service or resource dependencies, tool usage, and ownership patterns.\n\n**Core relationships:** Path-to-production flows (code→artifact→service→environment), service dependencies, tool usage, and ownership patterns.\n\n**Example questions you can ask:**\n\n- What services use the postgres database in production?\n- Show me all security tools used by our frontend services\n- What infrastructure resources does the payment service depend on?\n- Who owns the user authentication service?\n- Which CI/CD pipelines deploy to the staging environment?\n- What tools are configured for static code analysis?\n- Which services are deployed in the us-east region?\n- Show me the complete path from code to production for our API service\n- What third-party resources do we use across all environments?',
  inputSchema: z.object({
    operation: z
      .enum([
        'connect',
        'disconnect',
        'get_schema',
        'read_cypher',
        'write_cypher',
      ])
      .describe('Operation to perform'),
    config: Neo4jConfigSchema.optional().describe(
      'Neo4j connection configuration (required for connect operation)',
    ),
    query: z
      .string()
      .optional()
      .describe(
        'Cypher query to execute (required for read_cypher and write_cypher operations)',
      ),
    params: z
      .record(z.any())
      .optional()
      .describe('Query parameters (optional for cypher operations)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    operation: z.string(),
    data: z
      .union([
        Neo4jQueryResultSchema,
        Neo4jSchemaResultSchema,
        z.object({
          connected: z.boolean(),
          uri: z.string().nullable(),
          database: z.string().nullable(),
        }),
      ])
      .optional(),
    message: z.string(),
    metadata: z.object({
      queryTime: z.number().optional(),
      recordCount: z.number().optional(),
      connectionInfo: z.object({
        connected: z.boolean(),
        uri: z.string().nullable(),
        database: z.string().nullable(),
      }),
    }),
  }),
  execute: async ({ context }) => {
    const { operation, config, query, params = {} } = context;
    const store = Neo4jStore.getInstance();
    const startTime = Date.now();

    try {
      switch (operation) {
        case 'connect': {
          // Use provided config or fallback to environment variables
          let connectionConfig = config;

          if (!connectionConfig) {
            const envUri = process.env.NEO4J_URI;
            const envUsername = process.env.NEO4J_USERNAME;
            const envPassword = process.env.NEO4J_PASSWORD;
            const envDatabase = process.env.NEO4J_DATABASE;

            if (envUri && envUsername && envPassword) {
              connectionConfig = {
                uri: envUri,
                username: envUsername,
                password: envPassword,
                database: envDatabase,
              };
              console.log(
                '🔧 DEBUG: Using EKG config from environment variables',
              );
            } else {
              throw new Error(
                'config is required for connect operation or set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD environment variables',
              );
            }
          }

          await store.connect(connectionConfig);
          const connectionInfo = store.getConnectionInfo();

          const response = {
            success: true,
            operation: 'connect',
            data: connectionInfo,
            message: `Connected to EKG database at ${connectionConfig.uri}`,
            metadata: {
              queryTime: Date.now() - startTime,
              connectionInfo,
            },
          };

          console.log('🔧 DEBUG: EKG tool response:', response);
          return response;
        }

        case 'disconnect': {
          await store.disconnect();
          const connectionInfo = store.getConnectionInfo();

          const response = {
            success: true,
            operation: 'disconnect',
            message: 'Disconnected from EKG database',
            metadata: {
              queryTime: Date.now() - startTime,
              connectionInfo,
            },
          };

          console.log('🔧 DEBUG: EKG tool response:', response);
          return response;
        }

        case 'get_schema': {
          const schema = await store.getSchema();
          const connectionInfo = store.getConnectionInfo();

          const response = {
            success: true,
            operation: 'get_schema',
            data: schema,
            message: `Retrieved EKG schema with ${schema.nodes.length} node types and ${schema.relationships.length} relationship types`,
            metadata: {
              queryTime: Date.now() - startTime,
              recordCount: schema.nodes.length + schema.relationships.length,
              connectionInfo,
            },
          };

          console.log('🔧 DEBUG: EKG tool response:', response);
          return response;
        }

        case 'read_cypher': {
          if (!query) {
            throw new Error('query is required for read_cypher operation');
          }

          const result = await store.executeReadQuery(query, params || {});
          const connectionInfo = store.getConnectionInfo();

          const response = {
            success: true,
            operation: 'read_cypher',
            data: result,
            message: `Executed read query successfully. Retrieved ${result.records.length} records`,
            metadata: {
              queryTime: Date.now() - startTime,
              recordCount: result.records.length,
              connectionInfo,
            },
          };

          console.log('🔧 DEBUG: EKG tool response:', response);
          return response;
        }

        case 'write_cypher': {
          if (!query) {
            throw new Error('query is required for write_cypher operation');
          }

          const result = await store.executeWriteQuery(query, params || {});
          const connectionInfo = store.getConnectionInfo();

          // Build a summary of write operations
          const counters = result.summary.counters;
          const changes = [];
          if (counters.nodesCreated > 0)
            changes.push(`${counters.nodesCreated} nodes created`);
          if (counters.nodesDeleted > 0)
            changes.push(`${counters.nodesDeleted} nodes deleted`);
          if (counters.relationshipsCreated > 0)
            changes.push(
              `${counters.relationshipsCreated} relationships created`,
            );
          if (counters.relationshipsDeleted > 0)
            changes.push(
              `${counters.relationshipsDeleted} relationships deleted`,
            );
          if (counters.propertiesSet > 0)
            changes.push(`${counters.propertiesSet} properties set`);
          if (counters.labelsAdded > 0)
            changes.push(`${counters.labelsAdded} labels added`);
          if (counters.labelsRemoved > 0)
            changes.push(`${counters.labelsRemoved} labels removed`);

          const changesSummary =
            changes.length > 0 ? `: ${changes.join(', ')}` : '';

          const response = {
            success: true,
            operation: 'write_cypher',
            data: result,
            message: `Executed write query successfully${changesSummary}`,
            metadata: {
              queryTime: Date.now() - startTime,
              recordCount: result.records.length,
              connectionInfo,
            },
          };

          console.log('🔧 DEBUG: EKG tool response:', response);
          return response;
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      const connectionInfo = store.getConnectionInfo();

      const errorResponse = {
        success: false,
        operation,
        message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          queryTime: Date.now() - startTime,
          connectionInfo,
        },
      };

      console.log('🔧 DEBUG: EKG tool error response:', errorResponse);
      return errorResponse;
    }
  },
});
