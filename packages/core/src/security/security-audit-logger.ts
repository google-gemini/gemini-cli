/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Security audit logging for tracking security-relevant events.
 *
 * SECURITY NOTE: This module provides audit trails for security events
 * to enable incident response and forensic analysis.
 */

export enum SecurityEventType {
  COMMAND_BLOCKED = 'COMMAND_BLOCKED',
  ENVIRONMENT_INJECTION_BLOCKED = 'ENVIRONMENT_INJECTION_BLOCKED',
  PATH_TRAVERSAL_BLOCKED = 'PATH_TRAVERSAL_BLOCKED',
  CONFIG_TAMPERING_DETECTED = 'CONFIG_TAMPERING_DETECTED',
  TRUST_FLAG_USED = 'TRUST_FLAG_USED',
  CREDENTIAL_ENCRYPTION_FAILED = 'CREDENTIAL_ENCRYPTION_FAILED',
  CREDENTIAL_DECRYPTION_FAILED = 'CREDENTIAL_DECRYPTION_FAILED',
  DANGEROUS_ARGUMENT_BLOCKED = 'DANGEROUS_ARGUMENT_BLOCKED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export enum SecurityEventSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  timestamp: Date;
  message: string;
  details?: Record<string, unknown>;
  command?: string;
  serverName?: string;
}

/**
 * In-memory circular buffer for security events.
 * Limited to prevent memory exhaustion.
 */
class SecurityAuditLog {
  private events: SecurityEvent[] = [];
  private readonly maxEvents = 1000; // Keep last 1000 events

  /**
   * Logs a security event.
   */
  log(event: Omit<SecurityEvent, 'timestamp'>): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.events.push(fullEvent);

    // Maintain circular buffer
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log to console in development/debug mode
    if (process.env.GEMINI_DEBUG || process.env.GEMINI_SECURITY_AUDIT) {
      console.warn(`[SECURITY AUDIT] ${event.severity}: ${event.message}`, {
        type: event.type,
        details: event.details,
      });
    }
  }

  /**
   * Gets recent security events.
   */
  getEvents(limit?: number): SecurityEvent[] {
    if (limit) {
      return this.events.slice(-limit);
    }
    return [...this.events];
  }

  /**
   * Gets events of a specific type.
   */
  getEventsByType(type: SecurityEventType): SecurityEvent[] {
    return this.events.filter((event) => event.type === type);
  }

  /**
   * Gets events for a specific server.
   */
  getEventsByServer(serverName: string): SecurityEvent[] {
    return this.events.filter((event) => event.serverName === serverName);
  }

  /**
   * Gets events with severity >= specified level.
   */
  getEventsBySeverity(minSeverity: SecurityEventSeverity): SecurityEvent[] {
    const severityOrder = {
      [SecurityEventSeverity.LOW]: 0,
      [SecurityEventSeverity.MEDIUM]: 1,
      [SecurityEventSeverity.HIGH]: 2,
      [SecurityEventSeverity.CRITICAL]: 3,
    };

    const minLevel = severityOrder[minSeverity];
    return this.events.filter(
      (event) => severityOrder[event.severity] >= minLevel,
    );
  }

  /**
   * Clears the audit log.
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Gets a summary of security events.
   */
  getSummary(): {
    totalEvents: number;
    bySeverity: Record<SecurityEventSeverity, number>;
    byType: Record<SecurityEventType, number>;
    recentCritical: SecurityEvent[];
  } {
    const bySeverity: Record<SecurityEventSeverity, number> = {
      [SecurityEventSeverity.LOW]: 0,
      [SecurityEventSeverity.MEDIUM]: 0,
      [SecurityEventSeverity.HIGH]: 0,
      [SecurityEventSeverity.CRITICAL]: 0,
    };

    const byType: Record<SecurityEventType, number> = {} as Record<
      SecurityEventType,
      number
    >;

    for (const event of this.events) {
      bySeverity[event.severity]++;
      byType[event.type] = (byType[event.type] || 0) + 1;
    }

    const recentCritical = this.events
      .filter((e) => e.severity === SecurityEventSeverity.CRITICAL)
      .slice(-10);

    return {
      totalEvents: this.events.length,
      bySeverity,
      byType,
      recentCritical,
    };
  }
}

/**
 * Singleton audit log instance.
 */
export const auditLog = new SecurityAuditLog();

/**
 * Helper functions for logging common security events.
 */

export function logCommandBlocked(
  command: string,
  reason: string,
  serverName?: string,
): void {
  auditLog.log({
    type: SecurityEventType.COMMAND_BLOCKED,
    severity: SecurityEventSeverity.HIGH,
    message: `Blocked dangerous command: ${reason}`,
    command,
    serverName,
    details: { reason },
  });
}

export function logEnvironmentInjectionBlocked(
  varName: string,
  serverName?: string,
): void {
  auditLog.log({
    type: SecurityEventType.ENVIRONMENT_INJECTION_BLOCKED,
    severity: SecurityEventSeverity.HIGH,
    message: `Blocked dangerous environment variable: ${varName}`,
    serverName,
    details: { varName },
  });
}

export function logPathTraversalBlocked(
  path: string,
  serverName?: string,
): void {
  auditLog.log({
    type: SecurityEventType.PATH_TRAVERSAL_BLOCKED,
    severity: SecurityEventSeverity.MEDIUM,
    message: `Blocked path traversal attempt: ${path}`,
    serverName,
    details: { path },
  });
}

export function logTrustFlagUsed(
  command: string,
  serverName?: string,
): void {
  auditLog.log({
    type: SecurityEventType.TRUST_FLAG_USED,
    severity: SecurityEventSeverity.MEDIUM,
    message: `Trust flag used to bypass validation for: ${command}`,
    command,
    serverName,
    details: { command },
  });
}

export function logConfigTamperingDetected(
  configPath: string,
  reason: string,
): void {
  auditLog.log({
    type: SecurityEventType.CONFIG_TAMPERING_DETECTED,
    severity: SecurityEventSeverity.CRITICAL,
    message: `Configuration tampering detected: ${reason}`,
    details: { configPath, reason },
  });
}

export function logCredentialEncryptionFailed(error: string): void {
  auditLog.log({
    type: SecurityEventType.CREDENTIAL_ENCRYPTION_FAILED,
    severity: SecurityEventSeverity.HIGH,
    message: `Failed to encrypt credentials: ${error}`,
    details: { error },
  });
}

export function logCredentialDecryptionFailed(error: string): void {
  auditLog.log({
    type: SecurityEventType.CREDENTIAL_DECRYPTION_FAILED,
    severity: SecurityEventSeverity.HIGH,
    message: `Failed to decrypt credentials: ${error}`,
    details: { error },
  });
}

export function logDangerousArgumentBlocked(
  argument: string,
  reason: string,
  serverName?: string,
): void {
  auditLog.log({
    type: SecurityEventType.DANGEROUS_ARGUMENT_BLOCKED,
    severity: SecurityEventSeverity.HIGH,
    message: `Blocked dangerous argument: ${reason}`,
    serverName,
    details: { argument, reason },
  });
}

export function logRateLimitExceeded(
  identifier: string,
  attemptCount: number,
): void {
  auditLog.log({
    type: SecurityEventType.RATE_LIMIT_EXCEEDED,
    severity: SecurityEventSeverity.MEDIUM,
    message: `Rate limit exceeded for ${identifier}: ${attemptCount} attempts`,
    details: { identifier, attemptCount },
  });
}
