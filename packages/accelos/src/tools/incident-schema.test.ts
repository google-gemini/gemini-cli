import { describe, expect, it } from 'vitest';
import { IncidentDetailsSchema } from './incident-schema.js';

describe('IncidentDetailsSchema', () => {
  it('should validate incident with rootCauseAnalysis', () => {
    const validIncident = {
      id: 'INCIDENT-2025-09-06-1757181563722',
      name: 'GitHub Workflow Failure: Test Case',
      status: 'Resolved',
      severity: 'MEDIUM',
      declared: '2025-09-05T20:42:31Z',
      duration: '1h 2m 7s',
      timestamps: {
        declared: '2025-09-05T20:42:31Z',
        acknowledged: '2025-09-05T20:42:31Z',
        resolved: '2025-09-05T21:44:38Z'
      },
      reporter: 'System',
      incidentLead: 'incident-response',
      observers: ['user1'],
      environment: 'test/repo#branch',
      environmentType: 'Non-Production',
      timeline: [
        {
          id: 'incident_reported',
          timestamp: '2025-09-05T20:42:31Z',
          type: 'incident_reported',
          description: 'Test incident reported',
          user: 'system'
        }
      ],
      rootCauseAnalysis: {
        id: 'rca-test-12345',
        title: 'Test Root Cause Analysis',
        summary: 'This is a test root cause analysis for validation purposes.',
        initialProblem: 'Test system failed to start properly during deployment',
        fiveWhys: [
          {
            question: 'Why did the system fail to start?',
            answer: 'Database connection was refused'
          },
          {
            question: 'Why was the database connection refused?',
            answer: 'Database server was not running'
          },
          {
            question: 'Why was the database server not running?',
            answer: 'Configuration file was missing required parameters'
          },
          {
            question: 'Why were required parameters missing?',
            answer: 'Environment variables were not properly set in deployment'
          },
          {
            question: 'Why were environment variables not set?',
            answer: 'Deployment script did not include environment configuration step'
          }
        ],
        rootCause: 'Missing environment configuration step in deployment script',
        lessonsLearned: [
          'Test lesson 1',
          'Test lesson 2'
        ],
        author: 'incident-response',
        createdAt: '2025-09-06T17:59:23.722Z',
        updatedAt: '2025-09-06T17:59:23.722Z'
      },
      relatedIncidents: [],
      customFields: {
        workflowUrl: 'https://github.com/test/repo/actions/runs/123456',
        toolsUsed: ['github-mcp', 'incident-storage']
      },
      followUps: [
        {
          id: 'followup-test-001',
          title: 'Update documentation for test case',
          description: 'Add test documentation to prevent similar issues',
          assignee: 'test-team',
          dueDate: '2025-09-20T17:59:23.722Z',
          status: 'open',
          createdAt: '2025-09-06T17:59:23.722Z',
          updatedAt: '2025-09-06T17:59:23.722Z'
        }
      ],
      createdAt: '2025-09-06T17:59:23.722Z',
      updatedAt: '2025-09-06T17:59:23.722Z'
    };

    const result = IncidentDetailsSchema.safeParse(validIncident);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rootCauseAnalysis).toBeDefined();
      expect(result.data.rootCauseAnalysis?.id).toBe('rca-test-12345');
      expect(result.data.rootCauseAnalysis?.title).toBe('Test Root Cause Analysis');
      expect(result.data.rootCauseAnalysis?.initialProblem).toBe('Test system failed to start properly during deployment');
      expect(result.data.rootCauseAnalysis?.fiveWhys).toHaveLength(5);
      expect(result.data.rootCauseAnalysis?.fiveWhys[0].question).toBe('Why did the system fail to start?');
      expect(result.data.rootCauseAnalysis?.fiveWhys[0].answer).toBe('Database connection was refused');
      expect(result.data.rootCauseAnalysis?.rootCause).toBe('Missing environment configuration step in deployment script');
      expect(result.data.rootCauseAnalysis?.lessonsLearned).toHaveLength(2);
      
      // Verify followUps were parsed correctly
      expect(result.data.followUps).toBeDefined();
      expect(result.data.followUps).toHaveLength(1);
      expect(result.data.followUps[0].id).toBe('followup-test-001');
      expect(result.data.followUps[0].title).toBe('Update documentation for test case');
      expect(result.data.followUps[0].status).toBe('open');
      expect(result.data.followUps[0].assignee).toBe('test-team');
    }
  });

  it('should validate incident without rootCauseAnalysis (optional field)', () => {
    const validIncidentWithoutRCA = {
      id: 'INCIDENT-2025-09-06-1757181563722',
      name: 'GitHub Workflow Failure: Test Case',
      status: 'Resolved',
      severity: 'MEDIUM',
      declared: '2025-09-05T20:42:31Z',
      duration: '1h 2m 7s',
      timestamps: {
        declared: '2025-09-05T20:42:31Z',
        acknowledged: '2025-09-05T20:42:31Z',
        resolved: '2025-09-05T21:44:38Z'
      },
      reporter: 'System',
      incidentLead: 'incident-response',
      observers: ['user1'],
      environment: 'test/repo#branch',
      environmentType: 'Non-Production',
      timeline: [],
      relatedIncidents: [],
      customFields: {},
      followUps: [],
      createdAt: '2025-09-06T17:59:23.722Z',
      updatedAt: '2025-09-06T17:59:23.722Z'
    };

    const result = IncidentDetailsSchema.safeParse(validIncidentWithoutRCA);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rootCauseAnalysis).toBeUndefined();
    }
  });

  it('should reject incident with invalid rootCauseAnalysis structure', () => {
    const invalidIncident = {
      id: 'INCIDENT-2025-09-06-1757181563722',
      name: 'GitHub Workflow Failure: Test Case',
      status: 'Resolved',
      severity: 'MEDIUM',
      declared: '2025-09-05T20:42:31Z',
      duration: '1h 2m 7s',
      timestamps: {
        declared: '2025-09-05T20:42:31Z',
        acknowledged: '2025-09-05T20:42:31Z',
        resolved: '2025-09-05T21:44:38Z'
      },
      reporter: 'System',
      incidentLead: 'incident-response',
      observers: ['user1'],
      environment: 'test/repo#branch',
      environmentType: 'Non-Production',
      timeline: [],
      rootCauseAnalysis: {
        // Missing required fields like title, summary, initialProblem, fiveWhys, rootCause, etc.
        id: 'rca-test-12345',
        // title is missing
        // summary is missing
        // initialProblem is missing
        // fiveWhys is missing
        // rootCause is missing
        lessonsLearned: ['test'],
        author: 'test',
        createdAt: '2025-09-06T17:59:23.722Z',
        updatedAt: '2025-09-06T17:59:23.722Z'
      },
      relatedIncidents: [],
      customFields: {},
      followUps: [],
      createdAt: '2025-09-06T17:59:23.722Z',
      updatedAt: '2025-09-06T17:59:23.722Z'
    };

    const result = IncidentDetailsSchema.safeParse(invalidIncident);
    
    expect(result.success).toBe(false);
  });

  it('should validate incident with followUps containing all required fields', () => {
    const incidentWithFollowUps = {
      id: 'INCIDENT-2025-09-06-1757181563722',
      name: 'GitHub Workflow Failure: Test Case',
      status: 'Resolved',
      severity: 'MEDIUM',
      declared: '2025-09-05T20:42:31Z',
      duration: '1h 2m 7s',
      timestamps: {
        declared: '2025-09-05T20:42:31Z',
        acknowledged: '2025-09-05T20:42:31Z',
        resolved: '2025-09-05T21:44:38Z'
      },
      reporter: 'System',
      incidentLead: 'incident-response',
      observers: ['user1'],
      environment: 'test/repo#branch',
      environmentType: 'Non-Production',
      timeline: [],
      relatedIncidents: [],
      customFields: {},
      followUps: [
        {
          id: 'followup-documentation-001',
          title: 'Create troubleshooting documentation',
          description: 'Document the solution for future reference',
          assignee: 'documentation-team',
          dueDate: '2025-09-20T17:59:23.722Z',
          status: 'open',
          createdAt: '2025-09-06T17:59:23.722Z',
          updatedAt: '2025-09-06T17:59:23.722Z'
        },
        {
          id: 'followup-monitoring-002',
          title: 'Add monitoring for similar failures',
          status: 'in_progress',
          createdAt: '2025-09-06T17:59:23.722Z',
          updatedAt: '2025-09-06T17:59:23.722Z'
        }
      ],
      createdAt: '2025-09-06T17:59:23.722Z',
      updatedAt: '2025-09-06T17:59:23.722Z'
    };

    const result = IncidentDetailsSchema.safeParse(incidentWithFollowUps);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.followUps).toHaveLength(2);
      
      // First follow-up with all optional fields
      expect(result.data.followUps[0].id).toBe('followup-documentation-001');
      expect(result.data.followUps[0].title).toBe('Create troubleshooting documentation');
      expect(result.data.followUps[0].description).toBe('Document the solution for future reference');
      expect(result.data.followUps[0].assignee).toBe('documentation-team');
      expect(result.data.followUps[0].dueDate).toBe('2025-09-20T17:59:23.722Z');
      expect(result.data.followUps[0].status).toBe('open');
      
      // Second follow-up with minimal required fields
      expect(result.data.followUps[1].id).toBe('followup-monitoring-002');
      expect(result.data.followUps[1].title).toBe('Add monitoring for similar failures');
      expect(result.data.followUps[1].status).toBe('in_progress');
      expect(result.data.followUps[1].description).toBeUndefined();
      expect(result.data.followUps[1].assignee).toBeUndefined();
      expect(result.data.followUps[1].dueDate).toBeUndefined();
    }
  });

  it('should reject incident with invalid followUp structure', () => {
    const incidentWithInvalidFollowUp = {
      id: 'INCIDENT-2025-09-06-1757181563722',
      name: 'GitHub Workflow Failure: Test Case',
      status: 'Resolved',
      severity: 'MEDIUM',
      declared: '2025-09-05T20:42:31Z',
      duration: '1h 2m 7s',
      timestamps: {
        declared: '2025-09-05T20:42:31Z',
        acknowledged: '2025-09-05T20:42:31Z',
        resolved: '2025-09-05T21:44:38Z'
      },
      reporter: 'System',
      incidentLead: 'incident-response',
      observers: ['user1'],
      environment: 'test/repo#branch',
      environmentType: 'Non-Production',
      timeline: [],
      relatedIncidents: [],
      customFields: {},
      followUps: [
        {
          id: 'followup-invalid-001',
          // Missing required title field
          // Missing required status field
          // Missing required createdAt field
          // Missing required updatedAt field
          description: 'This followUp is missing required fields'
        }
      ],
      createdAt: '2025-09-06T17:59:23.722Z',
      updatedAt: '2025-09-06T17:59:23.722Z'
    };

    const result = IncidentDetailsSchema.safeParse(incidentWithInvalidFollowUp);
    
    expect(result.success).toBe(false);
  });
});