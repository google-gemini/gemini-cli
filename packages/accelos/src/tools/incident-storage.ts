import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import { IncidentDetailsSchema } from './incident-schema.js';

export type IncidentDetails = z.infer<typeof IncidentDetailsSchema>;

export const incidentStorageTool = createTool({
  id: 'store-incident',
  description: 'Store an incident response session to the data/incidents directory',
  inputSchema: z.object({
    incident: IncidentDetailsSchema.omit({ id: true, createdAt: true, updatedAt: true }),
    generateId: z.boolean().default(true).describe('Automatically generate an ID if not provided'),
    overwrite: z.boolean().default(false).describe('Overwrite existing incident if ID exists'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    incidentId: z.string().optional(),
    filePath: z.string().optional(),
    message: z.string(),
    stats: z.object({
      totalIncidents: z.number(),
      byStatus: z.record(z.number()),
      bySeverity: z.record(z.number()),
    }),
  }),
  execute: async ({ context }) => {
    const { incident, generateId, overwrite } = context;
    const incidentsDir = getCompatiblePaths(defaultConfig).incidentsDirectory;

    try {
      // Ensure incidents directory exists
      await fs.mkdir(incidentsDir, { recursive: true });

      // Generate ID if needed
      const incidentId = generateId ? 
        `INCIDENT-${new Date().toISOString().split('T')[0]}-${Date.now()}` : 
        `INCIDENT-${Date.now()}`;

      // Create full incident with timestamps
      const fullIncident: IncidentDetails = {
        ...incident,
        id: incidentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Validate the full incident
      const validatedIncident = IncidentDetailsSchema.parse(fullIncident);

      // Create file path
      const fileName = `${incidentId}.json`;
      const filePath = path.join(incidentsDir, fileName);

      // Check if file exists and overwrite setting
      try {
        await fs.access(filePath);
        if (!overwrite) {
          throw new Error(`Incident ${incidentId} already exists. Use overwrite=true to replace it.`);
        }
      } catch (error) {
        // File doesn't exist, which is fine for new incidents
        if (error instanceof Error && !error.message?.includes('ENOENT')) {
          throw error;
        }
      }

      // Write the incident to file
      await fs.writeFile(filePath, JSON.stringify(validatedIncident, null, 2), 'utf-8');

      // Generate stats
      const stats = await generateIncidentStats(incidentsDir);

      return {
        success: true,
        incidentId,
        filePath,
        message: `Successfully stored incident ${incidentId} in ${filePath}`,
        stats,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to store incident: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: { totalIncidents: 0, byStatus: {}, bySeverity: {} },
      };
    }
  },
});

// Helper function to generate incident statistics
async function generateIncidentStats(incidentsDir: string): Promise<{
  totalIncidents: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}> {
  const stats = {
    totalIncidents: 0,
    byStatus: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
  };

  try {
    const files = await fs.readdir(incidentsDir);
    const incidentFiles = files.filter(file => file.endsWith('.json'));

    for (const file of incidentFiles) {
      try {
        const filePath = path.join(incidentsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const incident = JSON.parse(content) as IncidentDetails;

        stats.totalIncidents++;
        
        // Count by status
        stats.byStatus[incident.status] = (stats.byStatus[incident.status] || 0) + 1;
        
        // Count by severity
        stats.bySeverity[incident.severity] = (stats.bySeverity[incident.severity] || 0) + 1;
      } catch (fileError) {
        console.warn(`Failed to process incident file ${file}:`, fileError);
      }
    }
  } catch (error) {
    console.warn('Failed to generate incident stats:', error);
  }

  return stats;
}

// Helper function to load incidents
export const loadIncidentTool = createTool({
  id: 'load-incidents',
  description: 'Load incidents from the data/incidents directory',
  inputSchema: z.object({
    incidentId: z.string().optional().describe('Specific incident ID to load'),
    limit: z.number().optional().describe('Maximum number of incidents to return'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    incidents: z.array(IncidentDetailsSchema),
    message: z.string(),
    stats: z.object({
      totalIncidents: z.number(),
      byStatus: z.record(z.number()),
      bySeverity: z.record(z.number()),
    }),
  }),
  execute: async ({ context }) => {
    const { incidentId, limit } = context;
    const incidentsDir = getCompatiblePaths(defaultConfig).incidentsDirectory;

    try {
      // Check if incidents directory exists
      try {
        await fs.access(incidentsDir);
      } catch {
        return {
          success: true,
          incidents: [],
          message: 'No incidents directory found',
          stats: { totalIncidents: 0, byStatus: {}, bySeverity: {} },
        };
      }

      const files = await fs.readdir(incidentsDir);
      const incidentFiles = files.filter(file => 
        file.startsWith('INCIDENT-') && file.endsWith('.json')
      );

      // If specific incident requested
      if (incidentId) {
        const fileName = `${incidentId}.json`;
        const filePath = path.join(incidentsDir, fileName);
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const incident = JSON.parse(content);
          const validatedIncident = IncidentDetailsSchema.parse(incident);
          
          const stats = await generateIncidentStats(incidentsDir);
          
          return {
            success: true,
            incidents: [validatedIncident],
            message: `Successfully loaded incident ${incidentId}`,
            stats,
          };
        } catch (error) {
          return {
            success: false,
            incidents: [],
            message: `Failed to load incident ${incidentId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stats: { totalIncidents: 0, byStatus: {}, bySeverity: {} },
          };
        }
      }

      // Load all incidents
      const incidents: IncidentDetails[] = [];
      const filesToProcess = limit ? incidentFiles.slice(0, limit) : incidentFiles;

      for (const file of filesToProcess) {
        try {
          const filePath = path.join(incidentsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const incident = JSON.parse(content);
          const validatedIncident = IncidentDetailsSchema.parse(incident);
          incidents.push(validatedIncident);
        } catch (error) {
          console.warn(`Failed to load incident file ${file}:`, error);
        }
      }

      // Sort by creation date (newest first)
      incidents.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );

      const stats = await generateIncidentStats(incidentsDir);

      return {
        success: true,
        incidents,
        message: `Successfully loaded ${incidents.length} incidents`,
        stats,
      };
    } catch (error) {
      return {
        success: false,
        incidents: [],
        message: `Failed to load incidents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: { totalIncidents: 0, byStatus: {}, bySeverity: {} },
      };
    }
  },
});