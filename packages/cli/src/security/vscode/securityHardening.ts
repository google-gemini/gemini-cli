/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Comprehensive Security Hardening for VS Code Plugin Integration
import * as crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { secureHeadersManager, SecurityHeaders } from './secureHeaders.js';
import { auditTrail } from '../../utils/auditTrail.js';

export interface SecurityHardeningConfig {
  enabled: boolean;
  paranoiaLevel: 'standard' | 'high' | 'extreme';
  monitoring: {
    enabled: boolean;
    alertThresholds: {
      suspiciousActivity: number;
      failedAuthentications: number;
      rateLimitViolations: number;
    };
  };
  hardening: {
    disableDangerousAPIs: boolean;
    sanitizeAllInputs: boolean;
    encryptSensitiveData: boolean;
    enableIntegrityChecks: boolean;
  };
  responseProtection: {
    removeStackTraces: boolean;
    sanitizeErrorMessages: boolean;
    limitResponseSize: number;
  };
}

export interface SecurityViolation {
  id: string;
  timestamp: number;
  type: 'injection' | 'authentication' | 'authorization' | 'data_exfiltration' | 'api_abuse' | 'integrity_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  source: string;
  target: string;
  payload?: string;
  mitigation: string[];
  blocked: boolean;
}

export interface SecurityContext {
  userId?: string;
  userRole?: string;
  requestCount?: number;
  isExtension?: boolean;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  vscodeVersion?: string;
  workspaceTrust?: boolean;
}

export interface HardenedRequest {
  [key: string]: unknown;
}

export interface HardenedResponse {
  [key: string]: unknown;
  _securityHeaders?: SecurityHeaders;
}

class SecurityHardeningManager {
  [x: string]: any;
  private static instance: SecurityHardeningManager;
  private config: SecurityHardeningConfig;
  private violations: SecurityViolation[] = [];
  private dangerousAPIs = new Set<string>();
  private securityPatterns: RegExp[] = [];

  static getInstance(): SecurityHardeningManager {
    if (!SecurityHardeningManager.instance) {
      SecurityHardeningManager.instance = new SecurityHardeningManager();
    }
    return SecurityHardeningManager.instance;
  }

  private constructor() {
    this.config = this.loadSecurityConfig();
    this.initializeDangerousAPIs();
    this.initializeSecurityPatterns();
  }

  private loadSecurityConfig(): SecurityHardeningConfig {
    return {
      enabled: process.env['SECURITY_HARDENING_ENABLED'] !== 'false',
      paranoiaLevel: (process.env['SECURITY_PARANOIA_LEVEL'] as SecurityHardeningConfig['paranoiaLevel']) || 'high',
      monitoring: {
        enabled: process.env['SECURITY_MONITORING_ENABLED'] !== 'false',
        alertThresholds: {
        suspiciousActivity: parseInt(process.env['SUSPICIOUS_ACTIVITY_THRESHOLD'] || '10'),
          failedAuthentications: parseInt(process.env['FAILED_AUTH_THRESHOLD'] || '5'),
          rateLimitViolations: parseInt(process.env['RATE_LIMIT_THRESHOLD'] || '20')
        }
      },
      hardening: {
        disableDangerousAPIs: process.env['DISABLE_DANGEROUS_APIS'] !== 'false',
        sanitizeAllInputs: process.env['SANITIZE_ALL_INPUTS'] !== 'false',
        encryptSensitiveData: process.env['ENCRYPT_SENSITIVE_DATA'] === 'true',
        enableIntegrityChecks: process.env['ENABLE_INTEGRITY_CHECKS'] !== 'false'
      },
      responseProtection: {
        removeStackTraces: process.env['REMOVE_STACK_TRACES'] !== 'false',
        sanitizeErrorMessages: process.env['SANITIZE_ERROR_MESSAGES'] !== 'false',
        limitResponseSize: parseInt(process.env['MAX_RESPONSE_SIZE'] || '1048576') // 1MB
      }
    };
  }

  private initializeDangerousAPIs(): void {
    // APIs that could be dangerous if exposed to plugins
    const dangerousAPIs = [
      'eval',
      'Function',
      'setTimeout',
      'setInterval',
      'XMLHttpRequest',
      'fetch',
      'WebSocket',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'webSQL',
      'FileReader',
      'FileWriter',
      'navigator.geolocation',
      'navigator.mediaDevices',
      'window.open',
      'document.write',
      'document.writeln',
      'innerHTML',
      'outerHTML'
    ];

    dangerousAPIs.forEach(api => this.dangerousAPIs.add(api));
  }

  private initializeSecurityPatterns(): void {
    // Patterns for detecting security threats
    this.securityPatterns = [
      // SQL Injection patterns
      /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b)/i,
      /(\bEXEC\b|\bEXECUTE\b|\bSP_EXECUTESQL\b)/i,

      // XSS patterns
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /data:text\/html/gi,

      // Path traversal
      /\.\.[\/\\]/,
      /%2e%2e[\/\\]/i,

      // Command injection
      /[;&|`$()]/,

      // Dangerous function calls
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /\bsetTimeout\s*\(/,
      /\bsetInterval\s*\(/,

      // Sensitive data patterns
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit cards
      /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/, // SSN
      /\b[A-Z]{2}\d{6}[A-Z]\b/, // More SSN patterns

      // API keys and tokens
      /\bapi[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{20,}\b/i,
      /\btoken\s*[:=]\s*[A-Za-z0-9_-]{20,}\b/i,
      /\bsecret\s*[:=]\s*[A-Za-z0-9_-]{20,}\b/i
    ];
  }

  async hardenRequest(request: HardenedRequest, context: SecurityContext): Promise<{
    hardened: HardenedRequest;
    violations: SecurityViolation[];
    safe: boolean;
  }> {
    const violations: SecurityViolation[] = [];
    let safe = true;

    try {
      // Step 1: Deep clone and sanitize
      const hardened = this.deepSanitize(request);

      // Step 2: Check for dangerous APIs
      if (this.config.hardening.disableDangerousAPIs) {
        const apiViolations = this.checkDangerousAPIs(hardened);
        violations.push(...apiViolations);
      }

      // Step 3: Pattern-based security checks
      const patternViolations = this.checkSecurityPatterns(hardened);
      violations.push(...patternViolations);

      // Step 4: Input validation and sanitization
      if (this.config.hardening.sanitizeAllInputs) {
        this.sanitizeInputs(hardened);
      }

      // Step 5: Integrity checks
      if (this.config.hardening.enableIntegrityChecks) {
        const integrityViolations = await this.checkIntegrity(hardened);
        violations.push(...integrityViolations);
      }

      // Step 6: Context-aware security checks
      const contextViolations = this.checkContextSecurity(hardened, context);
      violations.push(...contextViolations);

      // Determine if request is safe
      const criticalViolations = violations.filter(v => v.severity === 'critical');
      const highViolations = violations.filter(v => v.severity === 'high');

      if (criticalViolations.length > 0 || highViolations.length > 2) {
        safe = false;
      }

      // Log violations
      if (violations.length > 0) {
        await this.logSecurityViolations(violations, context);
      }

      // Apply paranoia level adjustments
      if (this.config.paranoiaLevel === 'extreme' && violations.length > 0) {
        safe = false;
      }

      return { hardened, violations, safe };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('💥 Security hardening failed', { error: errorMessage });

      // Create emergency violation
      const emergencyViolation: SecurityViolation = {
        id: `emergency_${Date.now()}`,
        timestamp: Date.now(),
        type: 'integrity_violation',
        severity: 'critical',
        description: `Security hardening failed: ${errorMessage}`,
        source: 'security_hardening',
        target: 'request_processing',
        mitigation: ['Request blocked due to security hardening failure'],
        blocked: true
      };

      violations.push(emergencyViolation);
      return { hardened: {}, violations, safe: false };
    }
  }

  private deepSanitize(obj: unknown, depth = 0): HardenedRequest {
    if (depth > 10) return { error: '[DEPTH_LIMIT_EXCEEDED]' };

    if (obj === null || obj === undefined) return obj as unknown as HardenedRequest;

    if (typeof obj === 'string') {
      return this.sanitizeString(obj) as unknown as HardenedRequest;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj as unknown as HardenedRequest;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitize(item, depth + 1)).slice(0, 100) as unknown as HardenedRequest; // Limit array size
    }

    if (typeof obj === 'object') {
      const sanitized: HardenedRequest = {};
      let propertyCount = 0;

      for (const [key, value] of Object.entries(obj)) {
        if (propertyCount >= 50) break; // Limit object properties
        if (typeof key === 'string' && key.length < 100) { // Limit key length
          sanitized[key] = this.deepSanitize(value, depth + 1);
          propertyCount++;
        }
      }

      return sanitized;
    }

    // For functions, symbols, etc., return safe representation
    return { error: '[UNSUPPORTED_TYPE]' };
  }

  private sanitizeString(str: string): string {
    if (typeof str !== 'string') return str;

    // Remove null bytes and other dangerous characters
    let sanitized = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Limit string length
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000) + '...[TRUNCATED]';
    }

    // HTML entity encoding
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    return sanitized;
  }

  private checkDangerousAPIs(obj: HardenedRequest): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    const checkValue = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        // Use Array.from for better compatibility with older TypeScript targets
        Array.from(this.dangerousAPIs).forEach(api => {
          if (value.includes(api)) {
            violations.push({
              id: `api_violation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              timestamp: Date.now(),
              type: 'api_abuse',
              severity: 'high',
              description: `Dangerous API usage detected: ${api}`,
              source: 'security_hardening',
              target: path,
              payload: value,
              mitigation: [
                `Remove usage of dangerous API: ${api}`,
                'Use safe alternatives provided by the framework',
                'Validate all dynamic code execution'
              ],
              blocked: false
            });
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        Object.keys(value).forEach(key => {
          const val = (value as Record<string, unknown>)[key];
          checkValue(val, `${path}.${key}`);
        });
      }
    };

    checkValue(obj, 'root');
    return violations;
  }

  private checkSecurityPatterns(obj: HardenedRequest): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    const checkValue = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        for (const pattern of this.securityPatterns) {
          if (pattern.test(value)) {
            const severity = this.determinePatternSeverity(pattern);
            violations.push({
              id: `pattern_violation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              timestamp: Date.now(),
              type: this.determinePatternType(pattern),
              severity,
              description: `Security pattern detected: ${pattern.source}`,
              source: 'security_hardening',
              target: path,
              payload: value.substring(0, 100), // Truncate for logging
              mitigation: this.getPatternMitigation(pattern),
              blocked: severity === 'critical'
            });
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, `${path}.${key}`);
        }
      }
    };

    checkValue(obj, 'root');
    return violations;
  }

  private determinePatternSeverity(pattern: RegExp): 'low' | 'medium' | 'high' | 'critical' {
    const patternStr = pattern.source.toLowerCase();

    if (patternStr.includes('union') || patternStr.includes('drop') || patternStr.includes('exec')) {
      return 'critical';
    }
    if (patternStr.includes('script') || patternStr.includes('javascript') || patternStr.includes('eval')) {
      return 'high';
    }
    if (patternStr.includes('api_key') || patternStr.includes('token') || patternStr.includes('secret')) {
      return 'high';
    }
    if (patternStr.includes('..') || patternStr.includes('path')) {
      return 'medium';
    }

    return 'low';
  }

  private determinePatternType(pattern: RegExp): SecurityViolation['type'] {
    const patternStr = pattern.source.toLowerCase();

    if (patternStr.includes('union') || patternStr.includes('select') || patternStr.includes('exec')) {
      return 'injection';
    }
    if (patternStr.includes('script') || patternStr.includes('javascript')) {
      return 'injection';
    }
    if (patternStr.includes('..')) {
      return 'authorization';
    }
    if (patternStr.includes('api_key') || patternStr.includes('token')) {
      return 'data_exfiltration';
    }

    return 'api_abuse';
  }

  private getPatternMitigation(pattern: RegExp): string[] {
    const patternStr = pattern.source.toLowerCase();
    const mitigations: string[] = [];

    if (patternStr.includes('union') || patternStr.includes('select')) {
      mitigations.push('Use parameterized queries');
      mitigations.push('Implement input validation');
      mitigations.push('Use ORM with built-in SQL injection protection');
    }

    if (patternStr.includes('script') || patternStr.includes('javascript')) {
      mitigations.push('Implement Content Security Policy (CSP)');
      mitigations.push('Use safe encoding functions');
      mitigations.push('Validate and sanitize all user inputs');
    }

    if (patternStr.includes('eval') || patternStr.includes('function')) {
      mitigations.push('Avoid dynamic code execution');
      mitigations.push('Use static analysis to detect dangerous patterns');
      mitigations.push('Implement code review processes');
    }

    if (patternStr.includes('api_key') || patternStr.includes('token')) {
      mitigations.push('Use secure credential storage');
      mitigations.push('Implement proper secret management');
      mitigations.push('Regular credential rotation');
    }

    if (mitigations.length === 0) {
      mitigations.push('Implement input validation');
      mitigations.push('Use principle of least privilege');
      mitigations.push('Regular security audits');
    }

    return mitigations;
  }

  private sanitizeInputs(obj: HardenedRequest): void {
    const sanitizeValue = (value: unknown): unknown => {
      if (typeof value === 'string') {
        // Additional sanitization for known dangerous patterns
        return value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT_REMOVED]')
          .replace(/javascript:/gi, '[JAVASCRIPT_REMOVED]')
          .replace(/vbscript:/gi, '[VBSCRIPT_REMOVED]')
          .replace(/on\w+\s*=/gi, '[EVENT_REMOVED]');
      }
      return value;
    };

    const sanitizeObject = (target: HardenedRequest) => {
      for (const [key, value] of Object.entries(target)) {
        if (typeof value === 'string') {
          target[key] = sanitizeValue(value);
        } else if (typeof value === 'object' && value !== null) {
          sanitizeObject(value as HardenedRequest);
        }
      }
    };

    sanitizeObject(obj);
  }

  private async checkIntegrity(obj: HardenedRequest): Promise<SecurityViolation[]> {
    const violations: SecurityViolation[] = [];

    // Check for tampering indicators
    const dataString = JSON.stringify(obj);
    // In production, compare against known good hashes
    // const hash = crypto.createHash('sha256').update(dataString).digest('hex');
    // For now, just check for obviously suspicious content

    if (dataString.includes('__proto__') || dataString.includes('constructor')) {
      violations.push({
        id: `integrity_violation_${Date.now()}`,
        timestamp: Date.now(),
        type: 'integrity_violation',
        severity: 'high',
        description: 'Potential prototype pollution detected',
        source: 'security_hardening',
        target: 'object_integrity',
        mitigation: [
          'Implement object property validation',
          'Use Object.freeze for sensitive objects',
          'Validate object structure before processing'
        ],
        blocked: false
      });
    }

    return violations;
  }

  private checkContextSecurity(obj: HardenedRequest, context: SecurityContext): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Check for context-appropriate actions
    if (context?.userRole === 'guest' && typeof obj === 'object' && obj !== null && 'method' in obj && obj['method'] === 'delete') {
      violations.push({
        id: `context_violation_${Date.now()}`,
        timestamp: Date.now(),
        type: 'authorization',
        severity: 'high',
        description: 'Unauthorized action attempt by guest user',
        source: 'security_hardening',
        target: 'authorization',
        mitigation: [
          'Implement proper role-based access control',
          'Validate user permissions before action',
          'Use principle of least privilege'
        ],
        blocked: false
      });
    }

    // Check for suspicious timing patterns
    if (context?.requestCount && context.requestCount > 1000) {
      violations.push({
        id: `timing_violation_${Date.now()}`,
        timestamp: Date.now(),
        type: 'api_abuse',
        severity: 'medium',
        description: 'High-frequency request pattern detected',
        source: 'security_hardening',
        target: 'rate_limiting',
        mitigation: [
          'Implement rate limiting',
          'Monitor for automated attacks',
          'Consider request throttling'
        ],
        blocked: false
      });
    }

    return violations;
  }

  async hardenResponse(response: HardenedResponse, context: SecurityContext): Promise<HardenedResponse> {
    let hardened = { ...response };

    // Remove sensitive information
    hardened = this.removeSensitiveData(hardened);

    // Sanitize error messages
    if (this.config.responseProtection.sanitizeErrorMessages) {
      hardened = this.sanitizeErrorMessages(hardened);
    }

    // Remove stack traces
    if (this.config.responseProtection.removeStackTraces) {
      hardened = this.removeStackTraces(hardened);
    }

    // Limit response size
    hardened = this.limitResponseSize(hardened);

    // Add security headers
    if (context?.isExtension) {
      const securityHeaders = this.secureHeadersManager.generateSecureHeaders(context);
      hardened._securityHeaders = securityHeaders;
    }

    return hardened;
  }

  private removeSensitiveData(obj: HardenedResponse): HardenedResponse {
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'private', 'session',
      'credit_card', 'ssn', 'social_security', 'api_key', 'auth_token'
    ];

    const removeSensitive = (target: Record<string, unknown>) => {
      if (typeof target === 'object' && target !== null) {
        for (const [key, value] of Object.entries(target)) {
          if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            target[key] = '[REDACTED]';
          } else if (typeof value === 'object' && value !== null) {
            removeSensitive(value as unknown as Record<string, unknown>);
          }
        }
      }
    };

    const cleaned = JSON.parse(JSON.stringify(obj)); // Deep clone
    removeSensitive(cleaned);
    return cleaned;
  }

  private sanitizeErrorMessages(obj: HardenedResponse): HardenedResponse {
    const sanitizeErrors = (target: Record<string, unknown>) => {
      if (typeof target === 'object' && target !== null) {
        for (const [key, value] of Object.entries(target)) {
          if (key === 'error' || key === 'message') {
            if (typeof value === 'string') {
              // Remove file paths, stack traces, and sensitive information
              target[key] = value
                .replace(/\/[^\s]+/g, '/[PATH_REDACTED]')
                .replace(/at\s+[^\s]+/g, 'at [FUNCTION_REDACTED]')
                .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]')
                .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
            }
          } else if (typeof value === 'object' && value !== null) {
            sanitizeErrors(value as unknown as Record<string, unknown>);
          }
        }
      }
    };

    const cleaned = JSON.parse(JSON.stringify(obj));
    sanitizeErrors(cleaned);
    return cleaned;
  }

  private removeStackTraces(obj: HardenedResponse): HardenedResponse {
    const removeStacks = (target: Record<string, unknown>) => {
      if (typeof target === 'object' && target !== null) {
        for (const [key, value] of Object.entries(target)) {
          if (key === 'stack' || key.includes('stack')) {
            delete target[key];
          } else if (typeof value === 'string' && value.includes('at ')) {
            // Remove stack trace lines
            const lines = value.split('\n');
            const filteredLines = lines.filter(line => !line.includes('at ') || !line.includes('.js:'));
            target[key] = filteredLines.join('\n');
          } else if (typeof value === 'object' && value !== null) {
            removeStacks(value as unknown as Record<string, unknown>);
          }
        }
      }
    };

    const cleaned = JSON.parse(JSON.stringify(obj));
    removeStacks(cleaned);
    return cleaned;
  }

  private limitResponseSize(obj: HardenedResponse): HardenedResponse {
    const size = JSON.stringify(obj).length;

    if (size > this.config.responseProtection.limitResponseSize) {
      return {
        error: 'Response too large',
        message: 'Response size exceeds configured limit',
        size,
        limit: this.config.responseProtection.limitResponseSize,
        truncated: true
      };
    }

    return obj;
  }

  private async logSecurityViolations(violations: SecurityViolation[], context: SecurityContext): Promise<void> {
    this.violations.push(...violations);

    // Keep only recent violations
    if (this.violations.length > 1000) {
      this.violations = this.violations.slice(-1000);
    }

    // Log to audit trail
    for (const violation of violations) {
      await auditTrail.recordEvent({
        eventType: 'security_violation',
        category: 'security',
        severity: violation.severity,
        actor: {
          id: context?.userId || 'unknown',
          type: context?.userId ? 'user' : 'anonymous'
        },
        resource: {
          type: 'security_system',
          id: 'hardening_engine',
          name: 'Security Hardening Engine'
        },
        action: {
          name: 'violation_detected',
          result: violation.blocked ? 'failure' : 'success',
          parameters: {
            violationType: violation.type,
            severity: violation.severity,
            description: violation.description
          }
        },
        context: {
          correlationId: violation.id,
          environment: 'vscode',
          service: 'vscode_extension',
          version: '1.0.0'
        },
        data: {
          dataClassification: 'restricted',
          before: undefined,
          after: {
            violation,
            context
          }
        },
        compliance: {
          frameworks: ['security_hardening'],
          requirements: ['threat_detection', 'incident_response'],
          evidence: {
            violationId: violation.id,
            blocked: violation.blocked,
            mitigation: violation.mitigation
          }
        },
        metadata: {
          securityViolation: true,
          hardeningLevel: this.config.paranoiaLevel,
          blockedRequest: violation.blocked,
          environment: 'vscode',
          service: 'vscode_extension',
          version: '1.0.0'
        }
      });
    }

    // Check monitoring thresholds
    await this.checkMonitoringThresholds(violations);
  }

  private async checkMonitoringThresholds(violations: SecurityViolation[]): Promise<void> {
    const recentViolations = violations.filter(
      v => Date.now() - v.timestamp < 3600000 // Last hour
    );

    const suspiciousCount = recentViolations.filter(v => v.severity === 'high' || v.severity === 'critical').length;

    if (suspiciousCount >= this.config.monitoring.alertThresholds.suspiciousActivity) {
      logger.error('🚨 SECURITY ALERT: High suspicious activity detected', {
        violations: suspiciousCount,
        threshold: this.config.monitoring.alertThresholds.suspiciousActivity
      });

      // In production, this would trigger alerts, notifications, etc.
    }
  }

  getSecurityReport(): {
    totalViolations: number;
    violationsByType: Record<string, number>;
    violationsBySeverity: Record<string, number>;
    recentViolations: SecurityViolation[];
    hardeningStatus: string;
    recommendations: string[];
  } {
    const violationsByType: Record<string, number> = {};
    const violationsBySeverity: Record<string, number> = {};
    const recentViolations = this.violations.filter(
      v => Date.now() - v.timestamp < 86400000 // Last 24 hours
    );

    for (const violation of this.violations) {
      violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
      violationsBySeverity[violation.severity] = (violationsBySeverity[violation.severity] || 0) + 1;
    }

    const recommendations = this.generateRecommendations(violationsByType, violationsBySeverity);

    return {
      totalViolations: this.violations.length,
      violationsByType,
      violationsBySeverity,
      recentViolations: recentViolations.slice(-10),
      hardeningStatus: this.config.paranoiaLevel,
      recommendations
    };
  }

  private generateRecommendations(
    violationsByType: Record<string, number>,
    violationsBySeverity: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    if (violationsBySeverity['critical'] > 0) {
      recommendations.push('🚨 CRITICAL: Immediate security review required');
      recommendations.push('🔒 Implement emergency security measures');
    }

    if (violationsByType['injection'] > 0) {
      recommendations.push('💉 Review input validation for injection attacks');
      recommendations.push('🛡️ Implement Content Security Policy (CSP)');
    }

    if (violationsByType['authorization'] > 0) {
      recommendations.push('🔐 Strengthen authorization controls');
      recommendations.push('👥 Implement role-based access control');
    }

    if (violationsByType['api_abuse'] > 0) {
      recommendations.push('🚦 Implement rate limiting');
      recommendations.push('📊 Monitor API usage patterns');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Security hardening is effective');
      recommendations.push('📈 Continue monitoring and updating security measures');
    }

    return recommendations;
  }

  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    violationsCount: number;
    hardeningLevel: string;
    recentViolations: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    const recentViolations = this.violations.filter(
      v => Date.now() - v.timestamp < 3600000
    ).length;

    if (recentViolations > 50) {
      issues.push('High number of recent violations');
      status = 'warning';
    }

    const criticalViolations = this.violations.filter(
      v => v.severity === 'critical' && Date.now() - v.timestamp < 86400000
    ).length;

    if (criticalViolations > 0) {
      issues.push('Critical security violations detected');
      status = 'critical';
    }

    return {
      status,
      violationsCount: this.violations.length,
      hardeningLevel: this.config.paranoiaLevel,
      recentViolations,
      issues
    };
  }

  // Emergency security lockdown
  emergencyLockdown(reason: string): void {
    logger.error('🚨 EMERGENCY SECURITY LOCKDOWN', { reason, hardeningLevel: this.config.paranoiaLevel });

    // Increase paranoia level to extreme
    this.config.paranoiaLevel = 'extreme';

    // Clear any cached data that might be compromised
    // Invalidate sessions, tokens, etc.

    logger.error('🔒 Security hardening escalated to extreme level');
  }
}

export const securityHardeningManager = SecurityHardeningManager.getInstance();
