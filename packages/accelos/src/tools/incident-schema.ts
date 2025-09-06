import { z } from 'zod';

// Timeline event types
const TimelineEventTypeSchema = z.enum([
  'incident_reported',
  'incident_acknowledged', 
  'status_update',
  'incident_resolved',
  'escalation',
  'user_action',
  'system_event'
]);

// Timeline event schema
const TimelineEventSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  type: TimelineEventTypeSchema,
  description: z.string(),
  user: z.string(),
  icon: z.any().optional(), // React component - could be more specific if needed
});

// Timestamps tracking schema
const TimestampsSchema = z.object({
  declared: z.string().datetime(),
  acknowledged: z.string().datetime().nullable(),
  resolved: z.string().datetime().nullable(),
});

// Incident status enum
const IncidentStatusSchema = z.enum([
  'Reported',
  'Acknowledged', 
  'Investigating',
  'In Progress',
  'Monitoring',
  'Resolved',
  'Unknown'
]);

// Incident severity enum
const IncidentSeveritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH', 
  'CRITICAL'
]);

// Environment type enum
const EnvironmentTypeSchema = z.enum([
  'Production',
  'Non-Production',
  'Development',
  'CI/CD',
  'Unknown'
]);

// Follow-up action schema
const FollowUpSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  assignee: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Escalation schema
const EscalationSchema = z.object({
  id: z.string(),
  level: z.number().min(1),
  escalatedTo: z.string(),
  escalatedBy: z.string(),
  reason: z.string(),
  timestamp: z.string().datetime(),
  status: z.enum(['active', 'resolved', 'cancelled']),
});

// 5-Why analysis schema
const FiveWhySchema = z.object({
  question: z.string(), // The "why" question
  answer: z.string(),   // The answer that leads to the next why
});

// Root Cause Analysis schema with 5-whys format
const RootCauseAnalysisSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  initialProblem: z.string(),        // The initial problem statement
  fiveWhys: z.array(FiveWhySchema),  // Array of 5 why questions and answers
  rootCause: z.string(),             // Final root cause derived from 5-whys
  lessonsLearned: z.array(z.string()),
  author: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Main incident details schema
export const IncidentDetailsSchema = z.object({
  // Core incident information
  id: z.string(),
  name: z.string(),
  status: IncidentStatusSchema,
  severity: IncidentSeveritySchema,
  
  // Timing information
  declared: z.string().datetime(),
  duration: z.string(), // e.g., "6h", "2d", "30m"
  timestamps: TimestampsSchema,
  
  // People and roles
  reporter: z.string(),
  incidentLead: z.string(),
  observers: z.array(z.string()),
  
  // Environment information
  environment: z.string(), // e.g., "prod-us-west-2", "staging-eu-central-1"
  environmentType: EnvironmentTypeSchema,
  
  // Timeline and activity
  timeline: z.array(TimelineEventSchema),
  
  // Additional incident details
  statusPage: z.string().url().nullable().optional(),
  relatedIncidents: z.array(z.string()).default([]),
  escalations: z.array(EscalationSchema).nullable().optional(),
  customFields: z.record(z.string(), z.any()).default({}),
  slackChannel: z.string().optional(), // e.g., "#incidents"
  rootCauseAnalysis: RootCauseAnalysisSchema.nullable().optional(),
  followUps: z.array(FollowUpSchema).default([]),
  
  // Metadata
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type IncidentDetails = z.infer<typeof IncidentDetailsSchema>;

// Additional schemas for specific use cases
export const IncidentSummarySchema = IncidentDetailsSchema.pick({
  id: true,
  name: true,
  status: true,
  severity: true,
  declared: true,
  duration: true,
  reporter: true,
  incidentLead: true,
  environment: true,
  environmentType: true,
});

export type IncidentSummary = z.infer<typeof IncidentSummarySchema>;

// Schema for creating new incidents (without computed fields)
export const CreateIncidentSchema = IncidentDetailsSchema.omit({
  id: true,
  timestamps: true,
  timeline: true,
  duration: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Override some fields for creation
  statusPage: z.string().url().optional(),
  escalations: z.array(EscalationSchema).optional(),
  rootCauseAnalysis: RootCauseAnalysisSchema.optional(),
});

export type CreateIncident = z.infer<typeof CreateIncidentSchema>;

// Schema for updating incidents
export const UpdateIncidentSchema = CreateIncidentSchema.partial().extend({
  id: z.string(),
  updatedAt: z.string().datetime().optional(),
});

export type UpdateIncident = z.infer<typeof UpdateIncidentSchema>;