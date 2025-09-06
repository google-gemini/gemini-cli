import { z } from 'zod';
import { IncidentDetailsSchema, type IncidentDetails } from '../tools/incident-schema.js';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const ListIncidentsQuerySchema = z.object({
  status: z.enum(['Reported', 'Acknowledged', 'Investigating', 'In Progress', 'Monitoring', 'Resolved', 'Unknown']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  environmentType: z.enum(['Production', 'Non-Production', 'Staging', 'Development', 'Unknown']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'declared', 'status', 'severity']).default('createdAt').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  includeTimeline: z.union([z.string(), z.boolean()]).optional().transform(val => {
    if (val === 'false' || val === false) return false;
    if (val === 'true' || val === true) return true;
    return true; // default
  }).default(true),
});

export interface IncidentListResponse {
  data: IncidentDetails[];
  metadata: {
    total: number;
    limit: number;
    offset: number;
    sortBy: string;
    sortOrder: string;
    filters: {
      status?: string;
      severity?: string;
      environmentType?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    stats: {
      totalIncidents: number;
      byStatus: Record<string, number>;
      bySeverity: Record<string, number>;
      byEnvironmentType: Record<string, number>;
    };
  };
}

export interface IncidentResponse {
  data?: IncidentDetails;
  error?: string;
}

async function loadAllIncidents(): Promise<IncidentDetails[]> {
  const incidentsDir = getCompatiblePaths(defaultConfig).incidentsDirectory;
  
  try {
    await fs.access(incidentsDir);
  } catch {
    return []; // Directory doesn't exist, return empty array
  }

  const files = await fs.readdir(incidentsDir);
  const incidentFiles = files.filter(file => file.endsWith('.json'));
  
  const incidents: IncidentDetails[] = [];
  for (const file of incidentFiles) {
    try {
      const filePath = path.join(incidentsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const incident = IncidentDetailsSchema.parse(JSON.parse(content));
      incidents.push(incident);
    } catch (error) {
      console.warn(`Failed to load incident file ${file}:`, error);
    }
  }
  
  return incidents;
}

function generateIncidentStats(incidents: IncidentDetails[]) {
  const stats = {
    totalIncidents: incidents.length,
    byStatus: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    byEnvironmentType: {} as Record<string, number>,
  };

  incidents.forEach(incident => {
    // Count by status
    stats.byStatus[incident.status] = (stats.byStatus[incident.status] || 0) + 1;
    
    // Count by severity
    stats.bySeverity[incident.severity] = (stats.bySeverity[incident.severity] || 0) + 1;
    
    // Count by environment type
    stats.byEnvironmentType[incident.environmentType] = (stats.byEnvironmentType[incident.environmentType] || 0) + 1;
  });

  return stats;
}

export const createIncidentsListHandler = () => {
  return async (c: any) => {
    try {
      const query = c.req.query();
      const validatedQuery = ListIncidentsQuerySchema.parse(query);

      const allIncidents = await loadAllIncidents();

      // Apply filters
      let filteredIncidents = allIncidents.filter(incident => {
        // Status filter
        if (validatedQuery.status && incident.status !== validatedQuery.status) return false;
        
        // Severity filter
        if (validatedQuery.severity && incident.severity !== validatedQuery.severity) return false;
        
        // Environment type filter
        if (validatedQuery.environmentType && incident.environmentType !== validatedQuery.environmentType) return false;
        
        // Date filters
        if (validatedQuery.dateFrom && new Date(incident.createdAt || incident.declared) < new Date(validatedQuery.dateFrom)) return false;
        if (validatedQuery.dateTo && new Date(incident.createdAt || incident.declared) > new Date(validatedQuery.dateTo)) return false;
        
        return true;
      });

      // Sort incidents
      const sortBy = validatedQuery.sortBy || 'createdAt';
      const sortOrder = validatedQuery.sortOrder || 'desc';
      
      filteredIncidents.sort((a, b) => {
        let valueA: any;
        let valueB: any;

        switch (sortBy) {
          case 'createdAt':
          case 'updatedAt':
            valueA = new Date(a[sortBy] || a.declared).getTime();
            valueB = new Date(b[sortBy] || b.declared).getTime();
            break;
          case 'declared':
            valueA = new Date(a.declared).getTime();
            valueB = new Date(b.declared).getTime();
            break;
          case 'status':
            valueA = a.status;
            valueB = b.status;
            break;
          case 'severity':
            valueA = a.severity;
            valueB = b.severity;
            break;
          default:
            valueA = new Date(a.createdAt || a.declared).getTime();
            valueB = new Date(b.createdAt || b.declared).getTime();
        }

        if (sortOrder === 'asc') {
          return valueA > valueB ? 1 : -1;
        } else {
          return valueA < valueB ? 1 : -1;
        }
      });

      const total = filteredIncidents.length;
      const limit = validatedQuery.limit || 50;
      const offset = validatedQuery.offset || 0;
      const includeTimeline = validatedQuery.includeTimeline !== false;

      const paginatedIncidents = filteredIncidents.slice(offset, offset + limit);

      // Prepare output incidents (optionally exclude timeline content)
      const outputIncidents = paginatedIncidents.map(incident => {
        if (includeTimeline) {
          return incident;
        } else {
          const { timeline, ...incidentWithoutTimeline } = incident;
          return incidentWithoutTimeline as IncidentDetails;
        }
      });

      const stats = generateIncidentStats(allIncidents);

      const response: IncidentListResponse = {
        data: outputIncidents,
        metadata: {
          total,
          limit,
          offset,
          sortBy,
          sortOrder,
          filters: {
            status: validatedQuery.status,
            severity: validatedQuery.severity,
            environmentType: validatedQuery.environmentType,
            dateFrom: validatedQuery.dateFrom,
            dateTo: validatedQuery.dateTo,
          },
          stats,
        },
      };

      return c.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid query parameters', details: error.errors }, 400);
      }
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
};

export const createIncidentByIdHandler = () => {
  return async (c: any) => {
    try {
      const id = c.req.param('id');
      
      if (!id) {
        return c.json({ error: 'Incident ID is required' }, 400);
      }

      const allIncidents = await loadAllIncidents();
      const incident = allIncidents.find(i => i.id === id);

      if (!incident) {
        return c.json({ error: 'Incident not found' }, 404);
      }

      const response: IncidentResponse = {
        data: incident,
      };

      return c.json(response);
    } catch (error) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
};