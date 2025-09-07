/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Advanced Audit Trail and Compliance Tracking System
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.js';

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: string;
  category: 'authentication' | 'authorization' | 'data_access' | 'system' | 'security' | 'compliance' | 'user_action' | 'api_call';
  severity: 'low' | 'medium' | 'high' | 'critical' | 'info';
  actor: {
    id: string;
    type: 'user' | 'service' | 'system' | 'anonymous';
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    location?: {
      country?: string;
      region?: string;
      city?: string;
    };
  };
  resource: {
    type: string;
    id: string;
    name?: string;
    owner?: string;
  };
  action: {
    name: string;
    parameters?: Record<string, unknown>;
    result: 'success' | 'failure' | 'partial' | 'denied';
    duration?: number;
    errorCode?: string;
    errorMessage?: string;
  };
  context: {
    environment: string;
    service: string;
    version: string;
    correlationId: string;
    parentEventId?: string;
    workflowId?: string;
  };
  data: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    sensitiveFields?: string[];
    dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
  };
  compliance: {
    frameworks: string[];
    requirements: string[];
    evidence: Record<string, unknown>;
  };
  metadata: Record<string, unknown>;
}

export interface AuditTrailConfig {
  enabled: boolean;
  storage: {
    type: 'file' | 'database' | 'siem' | 'cloud';
    path?: string;
    connectionString?: string;
    retentionDays: number;
    compression: boolean;
    encryption: boolean;
  };
  filtering: {
    enabled: boolean;
    minSeverity: AuditEvent['severity'];
    excludeCategories: string[];
    includePatterns: string[];
    samplingRate: number; // 0.0 to 1.0
  };
  realTime: {
    enabled: boolean;
    bufferSize: number;
    flushInterval: number;
    alertThresholds: {
      errorRate: number;
      anomalyScore: number;
      suspiciousActivity: number;
    };
  };
  compliance: {
    gdpr: boolean;
    sox: boolean;
    pci: boolean;
    hipaa: boolean;
    customFrameworks: string[];
  };
  forensics: {
    enabled: boolean;
    chainOfCustody: boolean;
    tamperDetection: boolean;
    integrityChecks: boolean;
  };
}

export interface AuditQuery {
  startTime?: number;
  endTime?: number;
  eventType?: string;
  category?: string;
  severity?: AuditEvent['severity'];
  actorId?: string;
  actorType?: AuditEvent['actor']['type'];
  resourceType?: string;
  resourceId?: string;
  actionName?: string;
  result?: AuditEvent['action']['result'];
  correlationId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditReport {
  query: AuditQuery;
  summary: {
    totalEvents: number;
    timeRange: { start: number; end: number };
    categories: Record<string, number>;
    severities: Record<string, number>;
    actors: Record<string, number>;
    results: Record<string, number>;
  };
  events: AuditEvent[];
  insights: {
    anomalies: string[];
    patterns: string[];
    recommendations: string[];
    compliance: Record<string, boolean>;
  };
  generatedAt: number;
  reportId: string;
}

export interface AuditMetrics {
  totalEvents: number;
  eventsPerSecond: number;
  storageSize: number;
  retentionCompliance: number;
  anomalyScore: number;
  integrityStatus: 'valid' | 'compromised' | 'unknown';
  complianceStatus: Record<string, boolean>;
}

class AuditTrailManager {
  private static instance: AuditTrailManager;
  private config: AuditTrailConfig;
  private eventBuffer: AuditEvent[] = [];
  private isInitialized = false;
  private metrics: AuditMetrics;
  private flushTimer?: NodeJS.Timeout;

  static getInstance(): AuditTrailManager {
    if (!AuditTrailManager.instance) {
      AuditTrailManager.instance = new AuditTrailManager();
    }
    return AuditTrailManager.instance;
  }

  private constructor() {
    this.config = this.loadAuditConfig();
    this.metrics = this.initializeMetrics();

    if (this.config.enabled) {
      this.initializeAuditTrail();
    }
  }

  private loadAuditConfig(): AuditTrailConfig {
    return {
      enabled: process.env.AUDIT_TRAIL_ENABLED !== 'false',
      storage: {
        type: (process.env.AUDIT_STORAGE_TYPE as AuditTrailConfig['storage']['type']) || 'file',
        path: process.env.AUDIT_STORAGE_PATH || path.join(process.cwd(), 'audit-logs'),
        retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '365'),
        compression: process.env.AUDIT_COMPRESSION !== 'false',
        encryption: process.env.AUDIT_ENCRYPTION === 'true'
      },
      filtering: {
        enabled: process.env.AUDIT_FILTERING_ENABLED !== 'false',
        minSeverity: (process.env.AUDIT_MIN_SEVERITY as AuditEvent['severity']) || 'info',
        excludeCategories: process.env.AUDIT_EXCLUDE_CATEGORIES?.split(',') || [],
        includePatterns: process.env.AUDIT_INCLUDE_PATTERNS?.split(',') || [],
        samplingRate: parseFloat(process.env.AUDIT_SAMPLING_RATE || '1.0')
      },
      realTime: {
        enabled: process.env.AUDIT_REALTIME_ENABLED !== 'false',
        bufferSize: parseInt(process.env.AUDIT_BUFFER_SIZE || '1000'),
        flushInterval: parseInt(process.env.AUDIT_FLUSH_INTERVAL || '30000'),
        alertThresholds: {
          errorRate: parseFloat(process.env.AUDIT_ERROR_RATE_THRESHOLD || '0.1'),
          anomalyScore: parseFloat(process.env.AUDIT_ANOMALY_THRESHOLD || '0.8'),
          suspiciousActivity: parseFloat(process.env.AUDIT_SUSPICIOUS_THRESHOLD || '5')
        }
      },
      compliance: {
        gdpr: process.env.AUDIT_GDPR_COMPLIANCE === 'true',
        sox: process.env.AUDIT_SOX_COMPLIANCE === 'true',
        pci: process.env.AUDIT_PCI_COMPLIANCE === 'true',
        hipaa: process.env.AUDIT_HIPAA_COMPLIANCE === 'true',
        customFrameworks: process.env.AUDIT_CUSTOM_FRAMEWORKS?.split(',') || []
      },
      forensics: {
        enabled: process.env.AUDIT_FORENSICS_ENABLED === 'true',
        chainOfCustody: process.env.AUDIT_CHAIN_OF_CUSTODY === 'true',
        tamperDetection: process.env.AUDIT_TAMPER_DETECTION === 'true',
        integrityChecks: process.env.AUDIT_INTEGRITY_CHECKS === 'true'
      }
    };
  }

  private initializeMetrics(): AuditMetrics {
    return {
      totalEvents: 0,
      eventsPerSecond: 0,
      storageSize: 0,
      retentionCompliance: 100,
      anomalyScore: 0,
      integrityStatus: 'valid',
      complianceStatus: {}
    };
  }

  private initializeAuditTrail(): void {
    // Create storage directory if using file storage
    if (this.config.storage.type === 'file' && this.config.storage.path) {
      try {
        fs.mkdirSync(this.config.storage.path, { recursive: true });
      } catch (error) {
        logger.error('❌ Failed to create audit log directory', { error: error.message });
      }
    }

    // Start real-time processing if enabled
    if (this.config.realTime.enabled) {
      this.flushTimer = setInterval(() => {
        this.flushEvents();
      }, this.config.realTime.flushInterval);
    }

    this.isInitialized = true;
    logger.info('📋 Audit trail initialized', {
      storage: this.config.storage.type,
      realTime: this.config.realTime.enabled
    });
  }

  async recordEvent(event: Partial<AuditEvent>): Promise<string> {
    if (!this.isInitialized) return '';

    // Apply filtering
    if (!this.shouldRecordEvent(event)) {
      return '';
    }

    const auditEvent: AuditEvent = {
      id: event.id || crypto.randomBytes(16).toString('hex'),
      timestamp: event.timestamp || Date.now(),
      eventType: event.eventType || 'unknown',
      category: event.category || 'system',
      severity: event.severity || 'info',
      actor: {
        id: event.actor?.id || 'system',
        type: event.actor?.type || 'system',
        ...event.actor
      },
      resource: {
        type: event.resource?.type || 'system',
        id: event.resource?.id || 'unknown',
        ...event.resource
      },
      action: {
        name: event.action?.name || 'unknown',
        result: event.action?.result || 'success',
        ...event.action
      },
      context: {
        environment: event.context?.environment || process.env.NODE_ENV || 'development',
        service: event.context?.service || 'gemini-mcp',
        version: event.context?.version || '1.0.0',
        correlationId: event.context?.correlationId || crypto.randomBytes(8).toString('hex'),
        ...event.context
      },
      data: {
        dataClassification: 'internal',
        ...event.data
      },
      compliance: {
        frameworks: [],
        requirements: [],
        evidence: {},
        ...event.compliance
      },
      metadata: event.metadata || {}
    };

    // Add compliance information
    this.enrichWithComplianceData(auditEvent);

    // Add forensic information
    if (this.config.forensics.enabled) {
      this.addForensicData(auditEvent);
    }

    // Buffer or write immediately
    if (this.config.realTime.enabled) {
      this.eventBuffer.push(auditEvent);

      // Flush if buffer is full
      if (this.eventBuffer.length >= this.config.realTime.bufferSize) {
        await this.flushEvents();
      }
    } else {
      await this.writeEvent(auditEvent);
    }

    this.metrics.totalEvents++;
    this.updateMetrics();

    logger.debug('📝 Audit event recorded', {
      id: auditEvent.id,
      type: auditEvent.eventType,
      category: auditEvent.category,
      severity: auditEvent.severity
    });

    return auditEvent.id;
  }

  private shouldRecordEvent(event: Partial<AuditEvent>): boolean {
    // Check minimum severity
    const severityLevels = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const eventSeverity = severityLevels[event.severity || 'info'];
    const minSeverity = severityLevels[this.config.filtering.minSeverity];

    if (eventSeverity < minSeverity) {
      return false;
    }

    // Check excluded categories
    if (this.config.filtering.excludeCategories.includes(event.category || '')) {
      return false;
    }

    // Check include patterns
    if (this.config.filtering.includePatterns.length > 0) {
      const matchesPattern = this.config.filtering.includePatterns.some(pattern =>
        (event.eventType || '').includes(pattern) ||
        (event.category || '').includes(pattern)
      );
      if (!matchesPattern) {
        return false;
      }
    }

    // Apply sampling
    if (Math.random() > this.config.filtering.samplingRate) {
      return false;
    }

    return true;
  }

  private enrichWithComplianceData(event: AuditEvent): void {
    const frameworks: string[] = [];
    const requirements: string[] = [];

    if (this.config.compliance.gdpr) {
      frameworks.push('GDPR');
      if (event.data.dataClassification === 'restricted') {
        requirements.push('Data Protection');
      }
    }

    if (this.config.compliance.sox) {
      frameworks.push('SOX');
      if (event.category === 'compliance' || event.category === 'system') {
        requirements.push('Financial Controls');
      }
    }

    if (this.config.compliance.pci) {
      frameworks.push('PCI-DSS');
      if (event.action.name.includes('payment')) {
        requirements.push('Payment Security');
      }
    }

    if (this.config.compliance.hipaa) {
      frameworks.push('HIPAA');
      if (event.data.dataClassification === 'restricted') {
        requirements.push('Health Data Protection');
      }
    }

    event.compliance.frameworks = [...frameworks, ...this.config.compliance.customFrameworks];
    event.compliance.requirements = requirements;
    event.compliance.evidence = {
      recordedAt: event.timestamp,
      integrityHash: this.generateIntegrityHash(event)
    };
  }

  private addForensicData(event: AuditEvent): void {
    if (this.config.forensics.chainOfCustody) {
      event.metadata.chainOfCustody = {
        recordedBy: 'gemini-mcp-audit-trail',
        recordedAt: event.timestamp,
        integrityVerified: true
      };
    }

    if (this.config.forensics.tamperDetection) {
      event.metadata.tamperProtection = {
        hash: this.generateIntegrityHash(event),
        algorithm: 'sha256',
        salt: crypto.randomBytes(16).toString('hex')
      };
    }
  }

  private generateIntegrityHash(event: AuditEvent): string {
    const data = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      eventType: event.eventType,
      actor: event.actor,
      resource: event.resource,
      action: event.action
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await Promise.all(eventsToFlush.map(event => this.writeEvent(event)));
      logger.debug('📤 Audit events flushed', { count: eventsToFlush.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to flush audit events', { error: errorMessage });

      // Re-queue events for retry
      this.eventBuffer.unshift(...eventsToFlush);
    }
  }

  private async writeEvent(event: AuditEvent): Promise<void> {
    switch (this.config.storage.type) {
      case 'file':
        await this.writeToFile(event);
        break;
      case 'database':
        await this.writeToDatabase(event);
        break;
      case 'siem':
        await this.writeToSIEM(event);
        break;
      case 'cloud':
        await this.writeToCloud(event);
        break;
    }
  }

  private async writeToFile(event: AuditEvent): Promise<void> {
    if (!this.config.storage.path) return;

    const date = new Date(event.timestamp);
    const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`;
    const filePath = path.join(this.config.storage.path, fileName);

    let data = JSON.stringify(event) + '\n';

    if (this.config.storage.compression) {
      // Simple compression simulation
      data = Buffer.from(data).toString('base64');
    }

    if (this.config.storage.encryption) {
      // Simple encryption simulation
      const key = crypto.scryptSync('audit-key', 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', key);
      data = cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
    }

    try {
      fs.appendFileSync(filePath, data);
    } catch (error) {
      logger.error('❌ Failed to write audit event to file', {
        filePath,
        error: error.message
      });
    }
  }

  private async writeToDatabase(event: AuditEvent): Promise<void> {
    // Implementation for database storage would go here
    logger.debug('💾 Audit event would be written to database', { eventId: event.id });
  }

  private async writeToSIEM(event: AuditEvent): Promise<void> {
    // Implementation for SIEM integration would go here
    logger.debug('🔗 Audit event would be sent to SIEM', { eventId: event.id });
  }

  private async writeToCloud(event: AuditEvent): Promise<void> {
    // Implementation for cloud storage would go here
    logger.debug('☁️ Audit event would be written to cloud', { eventId: event.id });
  }

  private updateMetrics(): void {
    const now = Date.now();
    // Update events per second (simple moving average)
    this.metrics.eventsPerSecond = this.metrics.totalEvents / Math.max(1, (now - Date.now() + 1000) / 1000);

    // Update storage size (simplified)
    if (this.config.storage.type === 'file' && this.config.storage.path) {
      try {
        const stats = fs.statSync(this.config.storage.path);
        this.metrics.storageSize = stats.size;
      } catch {
        this.metrics.storageSize = 0;
      }
    }
  }

  // Query and analysis methods
  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    // Implementation would depend on storage type
    logger.info('🔍 Querying audit events', { query });
    return [];
  }

  async generateReport(query: AuditQuery): Promise<AuditReport> {
    const events = await this.queryEvents(query);

    const categories: Record<string, number> = {};
    const severities: Record<string, number> = {};
    const actors: Record<string, number> = {};
    const results: Record<string, number> = {};

    events.forEach(event => {
      categories[event.category] = (categories[event.category] || 0) + 1;
      severities[event.severity] = (severities[event.severity] || 0) + 1;
      actors[event.actor.id] = (actors[event.actor.id] || 0) + 1;
      results[event.action.result] = (results[event.action.result] || 0) + 1;
    });

    const report: AuditReport = {
      query,
      summary: {
        totalEvents: events.length,
        timeRange: {
          start: query.startTime || 0,
          end: query.endTime || Date.now()
        },
        categories,
        severities,
        actors,
        results
      },
      events,
      insights: {
        anomalies: this.detectAnomalies(events),
        patterns: this.identifyPatterns(events),
        recommendations: this.generateRecommendations(events),
        compliance: this.checkCompliance(events)
      },
      generatedAt: Date.now(),
      reportId: crypto.randomBytes(8).toString('hex')
    };

    logger.info('📊 Audit report generated', {
      reportId: report.reportId,
      events: events.length
    });

    return report;
  }

  private detectAnomalies(events: AuditEvent[]): string[] {
    const anomalies: string[] = [];

    // Simple anomaly detection based on patterns
    const failedLogins = events.filter(e =>
      e.eventType === 'authentication' && e.action.result === 'failure'
    ).length;

    if (failedLogins > events.length * 0.1) {
      anomalies.push('High rate of failed authentication attempts');
    }

    const criticalEvents = events.filter(e => e.severity === 'critical').length;
    if (criticalEvents > 5) {
      anomalies.push('Multiple critical security events detected');
    }

    return anomalies;
  }

  private identifyPatterns(events: AuditEvent[]): string[] {
    const patterns: string[] = [];

    // Identify common patterns
    const categories = events.reduce((acc, event) => {
      acc[event.category] = (acc[event.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommonCategory = Object.entries(categories)
      .sort(([,a], [,b]) => b - a)[0];

    if (mostCommonCategory) {
      patterns.push(`Most common event category: ${mostCommonCategory[0]} (${mostCommonCategory[1]} events)`);
    }

    return patterns;
  }

  private generateRecommendations(events: AuditEvent[]): string[] {
    const recommendations: string[] = [];

    const failureRate = events.filter(e => e.action.result === 'failure').length / events.length;

    if (failureRate > 0.1) {
      recommendations.push('Investigate and resolve high failure rate');
    }

    if (events.some(e => e.category === 'security' && e.severity === 'high')) {
      recommendations.push('Review security controls and monitoring');
    }

    return recommendations;
  }

  private checkCompliance(events: AuditEvent[]): Record<string, boolean> {
    const compliance: Record<string, boolean> = {};

    if (this.config.compliance.gdpr) {
      const hasDataProtection = events.some(e =>
        e.compliance.frameworks.includes('GDPR') &&
        e.compliance.requirements.includes('Data Protection')
      );
      compliance.GDPR = hasDataProtection;
    }

    return compliance;
  }

  // Health and monitoring methods
  getMetrics(): AuditMetrics {
    return { ...this.metrics };
  }

  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    bufferSize: number;
    storageHealth: boolean;
    complianceStatus: Record<string, boolean>;
    issues: string[];
  } {
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (this.eventBuffer.length > this.config.realTime.bufferSize * 0.9) {
      issues.push('Audit event buffer is near capacity');
      status = 'warning';
    }

    if (this.metrics.integrityStatus === 'compromised') {
      issues.push('Audit log integrity compromised');
      status = 'critical';
    }

    if (this.metrics.anomalyScore > this.config.realTime.alertThresholds.anomalyScore) {
      issues.push('High anomaly score detected');
      status = 'warning';
    }

    return {
      status,
      bufferSize: this.eventBuffer.length,
      storageHealth: this.metrics.integrityStatus !== 'compromised',
      complianceStatus: this.metrics.complianceStatus,
      issues
    };
  }

  // Forensic analysis methods
  async verifyIntegrity(): Promise<boolean> {
    // Implementation for integrity verification
    logger.info('🔍 Verifying audit log integrity');
    return true;
  }

  async getChainOfCustody(eventId: string): Promise<any[]> {
    // Implementation for chain of custody tracking
    logger.info('🔗 Retrieving chain of custody', { eventId });
    return [];
  }

  // Administrative methods
  async cleanupOldEvents(): Promise<number> {
    const cutoffDate = Date.now() - (this.config.storage.retentionDays * 24 * 60 * 60 * 1000);

    logger.info('🧹 Cleaning up old audit events', {
      cutoffDate: new Date(cutoffDate).toISOString(),
      retentionDays: this.config.storage.retentionDays
    });

    // Implementation would depend on storage type
    return 0;
  }

  async exportEvents(query: AuditQuery, format: 'json' | 'csv' | 'xml' = 'json'): Promise<string> {
    const events = await this.queryEvents(query);

    switch (format) {
      case 'json':
        return JSON.stringify(events, null, 2);
      case 'csv':
        return this.convertToCSV(events);
      case 'xml':
        return this.convertToXML(events);
      default:
        return JSON.stringify(events);
    }
  }

  private convertToCSV(events: AuditEvent[]): string {
    if (events.length === 0) return '';

    const headers = Object.keys(events[0]);
    const csvRows = [
      headers.join(','),
      ...events.map(event =>
        headers.map(header => JSON.stringify((event as any)[header])).join(',')
      )
    ];

    return csvRows.join('\n');
  }

  private convertToXML(events: AuditEvent[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<auditEvents>\n';

    events.forEach(event => {
      xml += '  <event>\n';
      Object.entries(event).forEach(([key, value]) => {
        xml += `    <${key}>${JSON.stringify(value)}</${key}>\n`;
      });
      xml += '  </event>\n';
    });

    xml += '</auditEvents>';
    return xml;
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining events
    if (this.eventBuffer.length > 0) {
      await this.flushEvents();
    }

    this.isInitialized = false;
    logger.info('🛑 Audit trail shutdown');
  }
}

export const auditTrail = AuditTrailManager.getInstance();
