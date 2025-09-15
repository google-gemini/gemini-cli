/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Security event logging system for tracking security-related activities
 */

export enum SecurityEventType {
  // Generic security events - no specific vulnerabilities revealed
  CONFIGURATION_SECURITY = 'configuration_security',
  FILE_PERMISSION_SECURITY = 'file_permission_security',
  ENVIRONMENT_SANITIZATION = 'environment_sanitization',
  SERVER_VALIDATION = 'server_validation',
  WORKSPACE_TRUST_CHECK = 'workspace_trust_check',
  CREDENTIAL_ACCESS = 'credential_access'
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: Date;
  message: string;
  details?: Record<string, unknown>;
  source?: string;
}

/**
 * Security event logger for tracking security-related activities
 */
export class SecurityLogger {
  private events: SecurityEvent[] = [];
  private maxEvents: number = 1000; // Prevent memory issues

  /**
   * Logs a security event
   */
  log(
    type: SecurityEventType,
    severity: SecuritySeverity,
    message: string,
    details?: Record<string, unknown>,
    source?: string
  ): void {
    const event: SecurityEvent = {
      type,
      severity,
      timestamp: new Date(),
      message,
      details,
      source
    };

    this.events.push(event);

    // Maintain max events limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log to console with appropriate level
    this.logToConsole(event);
  }

  /**
   * Logs security event to console with appropriate formatting
   */
  private logToConsole(event: SecurityEvent): void {
    const prefix = `[SECURITY:${event.severity.toUpperCase()}]`;
    const message = `${prefix} ${event.message}`;

    switch (event.severity) {
      case SecuritySeverity.CRITICAL:
      case SecuritySeverity.HIGH:
        console.error(message);
        break;
      case SecuritySeverity.MEDIUM:
        console.warn(message);
        break;
      case SecuritySeverity.LOW:
      default:
        console.info(message);
        break;
    }

    // Log additional details in debug mode
    if (event.details && Object.keys(event.details).length > 0) {
      console.debug('[SECURITY:DETAILS]', event.details);
    }
  }

  /**
   * Gets security events since a specific date
   */
  getEvents(since?: Date): SecurityEvent[] {
    if (!since) {
      return [...this.events];
    }

    return this.events.filter(event => event.timestamp >= since);
  }

  /**
   * Gets security events of specific types
   */
  getEventsByType(types: SecurityEventType[]): SecurityEvent[] {
    return this.events.filter(event => types.includes(event.type));
  }

  /**
   * Gets security events by severity
   */
  getEventsBySeverity(severity: SecuritySeverity): SecurityEvent[] {
    return this.events.filter(event => event.severity === severity);
  }

  /**
   * Clears all logged events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Gets summary of security events
   */
  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {};

    for (const event of this.events) {
      summary[event.type] = (summary[event.type] || 0) + 1;
    }

    return summary;
  }

  /**
   * Exports security events for analysis
   */
  exportEvents(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

// Global security logger instance
export const securityLogger = new SecurityLogger();
