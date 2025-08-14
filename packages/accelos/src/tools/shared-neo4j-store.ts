import { z } from 'zod';
import neo4j, { Driver, Session } from 'neo4j-driver';

// Neo4j configuration schema
export const Neo4jConfigSchema = z.object({
  uri: z.string().describe('Neo4j database URI'),
  username: z.string().describe('Neo4j username'),
  password: z.string().describe('Neo4j password'),
  database: z.string().optional().describe('Neo4j database name (optional)'),
});

export type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;

// Neo4j query result schemas
export const Neo4jQueryResultSchema = z.object({
  records: z.array(z.record(z.any())),
  summary: z.object({
    query: z.string(),
    parameters: z.record(z.any()),
    queryType: z.string(),
    counters: z.object({
      nodesCreated: z.number(),
      nodesDeleted: z.number(),
      relationshipsCreated: z.number(),
      relationshipsDeleted: z.number(),
      propertiesSet: z.number(),
      labelsAdded: z.number(),
      labelsRemoved: z.number(),
      indexesAdded: z.number(),
      indexesRemoved: z.number(),
      constraintsAdded: z.number(),
      constraintsRemoved: z.number(),
    }),
  }),
});

export const Neo4jSchemaResultSchema = z.object({
  nodes: z.array(z.object({
    label: z.string(),
    properties: z.array(z.object({
      property: z.string(),
      type: z.string(),
    })),
  })),
  relationships: z.array(z.object({
    type: z.string(),
    properties: z.array(z.object({
      property: z.string(),
      type: z.string(),
    })),
  })),
});

export type Neo4jQueryResult = z.infer<typeof Neo4jQueryResultSchema>;
export type Neo4jSchemaResult = z.infer<typeof Neo4jSchemaResultSchema>;

// Shared Neo4j connection store
export class Neo4jStore {
  private static instance: Neo4jStore;
  private driver: Driver | null = null;
  private config: Neo4jConfig | null = null;
  private connected: boolean = false;

  private constructor() {}

  static getInstance(): Neo4jStore {
    if (!Neo4jStore.instance) {
      Neo4jStore.instance = new Neo4jStore();
    }
    return Neo4jStore.instance;
  }

  async connect(config: Neo4jConfig): Promise<void> {
    if (this.connected && this.driver) {
      console.log('🔧 DEBUG: Already connected to Neo4j');
      return;
    }

    console.log(`🔧 DEBUG: Connecting to Neo4j at ${config.uri}`);
    
    try {
      // Validate config
      const validatedConfig = Neo4jConfigSchema.parse(config);
      
      // Create driver
      this.driver = neo4j.driver(
        validatedConfig.uri,
        neo4j.auth.basic(validatedConfig.username, validatedConfig.password)
      );

      // Test connection
      await this.driver.verifyConnectivity();
      
      this.config = validatedConfig;
      this.connected = true;
      console.log('✅ DEBUG: Successfully connected to Neo4j');
    } catch (error) {
      if (this.driver) {
        await this.driver.close();
        this.driver = null;
      }
      throw new Error(`Failed to connect to Neo4j: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      console.log('🔧 DEBUG: Disconnecting from Neo4j');
      await this.driver.close();
      this.driver = null;
      this.connected = false;
      this.config = null;
      console.log('✅ DEBUG: Disconnected from Neo4j');
    }
  }

  private ensureConnected(): void {
    if (!this.connected || !this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }
  }

  async getSchema(): Promise<Neo4jSchemaResult> {
    this.ensureConnected();
    
    const session = this.driver!.session({ database: this.config?.database });
    
    try {
      // Get node labels and their properties - using basic queries if APOC not available
      let nodeQuery = `
        CALL apoc.meta.nodeTypeProperties() 
        YIELD nodeType, propertyName, propertyTypes
        RETURN nodeType as label, collect({property: propertyName, type: propertyTypes[0]}) as properties
        ORDER BY nodeType
      `;
      
      let nodes: any[] = [];
      try {
        const nodeResult = await session.run(nodeQuery);
        nodes = nodeResult.records.map((record: any) => ({
          label: record.get('label'),
          properties: record.get('properties'),
        }));
      } catch (error) {
        // Fallback if APOC is not available
        nodeQuery = `CALL db.labels() YIELD label RETURN label ORDER BY label`;
        const nodeResult = await session.run(nodeQuery);
        nodes = nodeResult.records.map((record: any) => ({
          label: record.get('label'),
          properties: [],
        }));
      }

      // Get relationship types and their properties
      let relQuery = `
        CALL apoc.meta.relTypeProperties() 
        YIELD relType, propertyName, propertyTypes
        RETURN relType as type, collect({property: propertyName, type: propertyTypes[0]}) as properties
        ORDER BY relType
      `;
      
      let relationships: any[] = [];
      try {
        const relResult = await session.run(relQuery);
        relationships = relResult.records.map((record: any) => ({
          type: record.get('type'),
          properties: record.get('properties'),
        }));
      } catch (error) {
        // Fallback if APOC is not available
        relQuery = `CALL db.relationshipTypes() YIELD relationshipType as type RETURN type ORDER BY type`;
        const relResult = await session.run(relQuery);
        relationships = relResult.records.map((record: any) => ({
          type: record.get('type'),
          properties: [],
        }));
      }

      const schema = { nodes, relationships };
      console.log(`🔧 DEBUG: Schema query response:`, {
        nodeCount: schema.nodes.length,
        relationshipCount: schema.relationships.length,
        nodeLabels: schema.nodes.map(n => n.label),
        relationshipTypes: schema.relationships.map(r => r.type)
      });
      
      return schema;
    } catch (error) {
      throw new Error(`Failed to get schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await session.close();
    }
  }

  async executeReadQuery(query: string, params: Record<string, any> = {}): Promise<Neo4jQueryResult> {
    this.ensureConnected();
    this.validateReadQuery(query);
    
    const session = this.driver!.session({ database: this.config?.database });
    
    try {
      console.log(`🔧 DEBUG: Executing read query: ${query}`);
      const result = await session.run(query, params);
      
      const formattedResult = this.formatResult(result);
      console.log(`🔧 DEBUG: Read query response:`, {
        recordCount: formattedResult.records.length,
        queryType: formattedResult.summary.queryType,
        records: formattedResult.records.length > 0 ? formattedResult.records.slice(0, 3) : [], // Show first 3 records
        counters: formattedResult.summary.counters
      });
      
      return formattedResult;
    } catch (error) {
      throw new Error(`Failed to execute read query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await session.close();
    }
  }

  async executeWriteQuery(query: string, params: Record<string, any> = {}): Promise<Neo4jQueryResult> {
    this.ensureConnected();
    this.validateWriteQuery(query);
    
    const session = this.driver!.session({ database: this.config?.database });
    
    try {
      console.log(`🔧 DEBUG: Executing write query: ${query}`);
      const result = await session.run(query, params);
      
      const formattedResult = this.formatResult(result);
      console.log(`🔧 DEBUG: Write query response:`, {
        recordCount: formattedResult.records.length,
        queryType: formattedResult.summary.queryType,
        counters: formattedResult.summary.counters,
        changes: this.summarizeChanges(formattedResult.summary.counters)
      });
      
      return formattedResult;
    } catch (error) {
      throw new Error(`Failed to execute write query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await session.close();
    }
  }

  private validateReadQuery(query: string): void {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery.startsWith('match') && !normalizedQuery.startsWith('return') && 
        !normalizedQuery.startsWith('with') && !normalizedQuery.startsWith('unwind') && 
        !normalizedQuery.startsWith('call')) {
      throw new Error('Read queries must start with MATCH, RETURN, WITH, UNWIND, or CALL');
    }
    
    // Check for write operations
    const writeKeywords = ['create', 'merge', 'set', 'delete', 'remove', 'detach'];
    const hasWriteOperation = writeKeywords.some(keyword => 
      normalizedQuery.includes(keyword.toLowerCase())
    );
    
    if (hasWriteOperation) {
      throw new Error('Read queries cannot contain write operations');
    }
  }

  private validateWriteQuery(query: string): void {
    const normalizedQuery = query.trim().toLowerCase();
    const allowedWriteKeywords = ['create', 'merge', 'set', 'delete', 'remove', 'detach'];
    
    const hasAllowedOperation = allowedWriteKeywords.some(keyword => 
      normalizedQuery.includes(keyword.toLowerCase())
    );
    
    if (!hasAllowedOperation) {
      throw new Error('Write queries must contain CREATE, MERGE, SET, DELETE, REMOVE, or DETACH operations');
    }
  }

  private formatResult(result: any): Neo4jQueryResult {
    const records = result.records.map((record: any) => {
      const obj: Record<string, any> = {};
      record.keys.forEach((key: string) => {
        const value = record.get(key);
        obj[key] = this.serializeNeo4jValue(value);
      });
      return obj;
    });

    const summary = result.summary;
    const counters = summary.counters;

    return {
      records,
      summary: {
        query: summary.query.text,
        parameters: summary.query.parameters || {},
        queryType: summary.queryType,
        counters: {
          nodesCreated: counters.updates()?.nodesCreated || 0,
          nodesDeleted: counters.updates()?.nodesDeleted || 0,
          relationshipsCreated: counters.updates()?.relationshipsCreated || 0,
          relationshipsDeleted: counters.updates()?.relationshipsDeleted || 0,
          propertiesSet: counters.updates()?.propertiesSet || 0,
          labelsAdded: counters.updates()?.labelsAdded || 0,
          labelsRemoved: counters.updates()?.labelsRemoved || 0,
          indexesAdded: counters.updates()?.indexesAdded || 0,
          indexesRemoved: counters.updates()?.indexesRemoved || 0,
          constraintsAdded: counters.updates()?.constraintsAdded || 0,
          constraintsRemoved: counters.updates()?.constraintsRemoved || 0,
        },
      },
    };
  }

  private serializeNeo4jValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }
    
    // Handle Neo4j specific types
    if (value && typeof value === 'object' && value.constructor) {
      const constructorName = value.constructor.name;
      
      if (constructorName === 'Node') {
        return {
          identity: value.identity.toString(),
          labels: value.labels,
          properties: value.properties,
        };
      }
      
      if (constructorName === 'Relationship') {
        return {
          identity: value.identity.toString(),
          start: value.start.toString(),
          end: value.end.toString(),
          type: value.type,
          properties: value.properties,
        };
      }
      
      if (constructorName === 'Path') {
        return {
          start: this.serializeNeo4jValue(value.start),
          end: this.serializeNeo4jValue(value.end),
          segments: value.segments.map((seg: any) => ({
            start: this.serializeNeo4jValue(seg.start),
            relationship: this.serializeNeo4jValue(seg.relationship),
            end: this.serializeNeo4jValue(seg.end),
          })),
        };
      }
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(v => this.serializeNeo4jValue(v));
    }
    
    // Handle objects
    if (typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.serializeNeo4jValue(val);
      }
      return result;
    }
    
    // Handle primitive types
    return value;
  }

  private summarizeChanges(counters: any): string[] {
    const changes = [];
    if (counters.nodesCreated > 0) changes.push(`${counters.nodesCreated} nodes created`);
    if (counters.nodesDeleted > 0) changes.push(`${counters.nodesDeleted} nodes deleted`);
    if (counters.relationshipsCreated > 0) changes.push(`${counters.relationshipsCreated} relationships created`);
    if (counters.relationshipsDeleted > 0) changes.push(`${counters.relationshipsDeleted} relationships deleted`);
    if (counters.propertiesSet > 0) changes.push(`${counters.propertiesSet} properties set`);
    if (counters.labelsAdded > 0) changes.push(`${counters.labelsAdded} labels added`);
    if (counters.labelsRemoved > 0) changes.push(`${counters.labelsRemoved} labels removed`);
    return changes.length > 0 ? changes : ['no changes'];
  }

  getConnectionInfo(): {
    connected: boolean;
    uri: string | null;
    database: string | null;
  } {
    return {
      connected: this.connected,
      uri: this.config?.uri || null,
      database: this.config?.database || null,
    };
  }
}