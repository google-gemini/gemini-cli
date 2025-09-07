/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Secure Headers and CSP for VS Code Plugin Communication
import { logger } from '../../utils/logger.js';

export interface SecurityHeaders {
  // Content Security Policy
  'Content-Security-Policy': string;

  // Prevent clickjacking
  'X-Frame-Options': string;
  'Content-Security-Policy-Report-Only'?: string;

  // Prevent MIME sniffing
  'X-Content-Type-Options': string;

  // XSS protection
  'X-XSS-Protection': string;

  // Referrer policy
  'Referrer-Policy': string;

  // HSTS (for HTTPS connections)
  'Strict-Transport-Security'?: string;

  // Feature policy
  'Permissions-Policy': string;

  // Custom security headers
  'X-VSCode-Security-Token': string;
  'X-Request-ID': string;
  'X-Timestamp': string;
}

export interface CSPDirectives {
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'font-src': string[];
  'connect-src': string[];
  'media-src': string[];
  'object-src': string[];
  'frame-src': string[];
  'frame-ancestors': string[];
  'form-action': string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
}

export interface SecurityContext {
  isExtension: boolean;
  extensionId?: string;
  extensionVersion?: string;
  vscodeVersion: string;
  workspaceTrust: boolean;
  remoteAuthority?: string;
  webviewResourceRoots?: string[];
}

export class SecureHeadersManager {
  private static instance: SecureHeadersManager;
  private securityTokens = new Map<string, { token: string; expires: number; context: SecurityContext }>();

  static getInstance(): SecureHeadersManager {
    if (!SecureHeadersManager.instance) {
      SecureHeadersManager.instance = new SecureHeadersManager();
    }
    return SecureHeadersManager.instance;
  }

  private constructor() {
    // Clean up expired tokens every 5 minutes
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 5 * 60 * 1000);
  }

  generateSecureHeaders(securityContext: SecurityContext): SecurityHeaders {
    const requestId = this.generateRequestId();
    const timestamp = Date.now().toString();
    const securityToken = this.generateSecurityToken(securityContext, requestId);

    const csp = this.generateCSP(securityContext);
    const permissionsPolicy = this.generatePermissionsPolicy(securityContext);

    const headers: SecurityHeaders = {
      // Strict CSP for VS Code extension communication
      'Content-Security-Policy': csp,

      // Prevent clickjacking attacks
      'X-Frame-Options': 'DENY',

      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',

      // XSS protection (though CSP is primary)
      'X-XSS-Protection': '1; mode=block',

      // Strict referrer policy
      'Referrer-Policy': 'strict-origin-when-cross-origin',

      // Feature policy for VS Code
      'Permissions-Policy': permissionsPolicy,

      // Custom security token
      'X-VSCode-Security-Token': securityToken,
      'X-Request-ID': requestId,
      'X-Timestamp': timestamp
    };

    // Add HSTS for HTTPS connections
    if (securityContext.remoteAuthority) {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    }

    // Add CSP report-only for monitoring
    if (process.env['CSP_REPORTING_ENABLED'] === 'true') {
      headers['Content-Security-Policy-Report-Only'] = this.generateCSPReportOnly(securityContext);
    }

    return headers;
  }

  private generateCSP(context: SecurityContext): string {
    const directives: CSPDirectives = {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"], // Limited for VS Code
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'vscode-resource:', 'https:'],
      'font-src': ["'self'", 'vscode-resource:', 'https:'],
      'connect-src': ["'self'", 'https:', 'wss:'],
      'media-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': true,
      'block-all-mixed-content': true
    };

    // Add extension-specific CSP rules
    if (context.isExtension && context.extensionId) {
      directives['script-src'].push(`vscode-extension://${context.extensionId}/`);
      directives['style-src'].push(`vscode-extension://${context.extensionId}/`);
      directives['img-src'].push(`vscode-extension://${context.extensionId}/`);
    }

    // Add webview resource roots if available
    if (context.webviewResourceRoots) {
      context.webviewResourceRoots.forEach(root => {
        directives['script-src'].push(root);
        directives['style-src'].push(root);
        directives['img-src'].push(root);
      });
    }

    // Convert to CSP string
    const cspParts: string[] = [];

    for (const [directive, values] of Object.entries(directives)) {
      if (Array.isArray(values)) {
        cspParts.push(`${directive} ${values.join(' ')}`);
      } else if (typeof values === 'boolean' && values) {
        cspParts.push(directive);
      }
    }

    return cspParts.join('; ');
  }

  private generateCSPReportOnly(context: SecurityContext): string {
    // Report-only CSP for monitoring violations
    return `${this.generateCSP(context)}; report-uri /csp-report`;
  }

  private generatePermissionsPolicy(context: SecurityContext): string {
    const policies = [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'picture-in-picture=()'
    ];

    // Allow clipboard for VS Code functionality
    if (context.isExtension) {
      policies.push('clipboard-write=(self)');
    }

    return policies.join(', ');
  }

  private generateSecurityToken(context: SecurityContext, requestId: string): string {
    const payload = {
      requestId,
      extensionId: context.extensionId,
      timestamp: Date.now(),
      vscodeVersion: context.vscodeVersion,
      workspaceTrust: context.workspaceTrust
    };

    const token = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = this.generateSignature(token);

    return `${token}.${signature}`;
  }

  private generateSignature(data: string): string {
    // Simple HMAC for demonstration - use proper crypto in production
    const crypto = require('crypto');
    const secret = process.env.SECURITY_TOKEN_SECRET || 'default-secret-key';
    return crypto.createHmac('sha256', secret).update(data).digest('hex').substring(0, 16);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validateSecurityToken(token: string): { valid: boolean; context?: SecurityContext; error?: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [payload, signature] = parts;
      const expectedSignature = this.generateSignature(payload);

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid token signature' };
      }

      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());

      // Check token expiration (5 minute window)
      if (Date.now() - decodedPayload.timestamp > 5 * 60 * 1000) {
        return { valid: false, error: 'Token expired' };
      }

      return {
        valid: true,
        context: {
          isExtension: true,
          extensionId: decodedPayload.extensionId,
          vscodeVersion: decodedPayload.vscodeVersion,
          workspaceTrust: decodedPayload.workspaceTrust
        } as SecurityContext
      };

    } catch (error) {
      return { valid: false, error: 'Token parsing failed' };
    }
  }

  validateSecurityHeaders(headers: Record<string, string>, expectedToken?: string): {
    valid: boolean;
    violations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    const violations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check for required security headers
    const requiredHeaders = [
      'X-VSCode-Security-Token',
      'X-Request-ID',
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options'
    ];

    for (const header of requiredHeaders) {
      if (!headers[header]) {
        violations.push(`Missing required header: ${header}`);
        riskLevel = 'high';
      }
    }

    // Validate security token
    if (expectedToken && headers['X-VSCode-Security-Token']) {
      const tokenValidation = this.validateSecurityToken(headers['X-VSCode-Security-Token']);
      if (!tokenValidation.valid) {
        violations.push(`Invalid security token: ${tokenValidation.error}`);
        riskLevel = 'critical';
      }
    }

    // Check CSP header
    if (headers['Content-Security-Policy']) {
      const cspViolations = this.validateCSPHeader(headers['Content-Security-Policy']);
      violations.push(...cspViolations);
      if (cspViolations.length > 0) {
        riskLevel = riskLevel === 'critical' ? 'critical' : 'high';
      }
    }

    // Check for suspicious headers
    const suspiciousHeaders = ['X-Forwarded-For', 'X-Real-IP'];
    for (const header of suspiciousHeaders) {
      if (headers[header]) {
        violations.push(`Suspicious header present: ${header}`);
        riskLevel = riskLevel === 'critical' ? 'critical' : 'medium';
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      riskLevel
    };
  }

  private validateCSPHeader(csp: string): string[] {
    const violations: string[] = [];

    // Check for dangerous CSP directives
    if (csp.includes("'unsafe-inline'")) {
      violations.push('CSP allows unsafe inline scripts');
    }

    if (csp.includes("'unsafe-eval'")) {
      violations.push('CSP allows unsafe eval');
    }

    if (csp.includes('*')) {
      violations.push('CSP uses wildcard sources');
    }

    if (!csp.includes('default-src')) {
      violations.push('CSP missing default-src directive');
    }

    return violations;
  }

  generateSecurityReport(): {
    activeTokens: number;
    recentValidations: number;
    violationsDetected: number;
    riskDistribution: Record<string, number>;
    recommendations: string[];
  } {
    // Generate security report for monitoring
    return {
      activeTokens: this.securityTokens.size,
      recentValidations: 0, // Would track actual validations
      violationsDetected: 0, // Would track actual violations
      riskDistribution: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      recommendations: [
        'Regular security header audits',
        'Monitor CSP violation reports',
        'Rotate security tokens periodically',
        'Implement rate limiting for API endpoints'
      ]
    };
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let cleaned = 0;

    // Use Array.from for better compatibility with older TypeScript targets
    Array.from(this.securityTokens.entries()).forEach(([tokenId, tokenData]) => {
      if (now > tokenData.expires) {
        this.securityTokens.delete(tokenId);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      logger.debug('🧹 Cleaned up expired security tokens', { count: cleaned });
    }
  }

  // Emergency security lockdown
  emergencyLockdown(reason: string): void {
    logger.error('🚨 EMERGENCY SECURITY LOCKDOWN', { reason });

    // Clear all active tokens
    this.securityTokens.clear();

    // Log emergency event
    // In production, this would trigger alerts and notifications

    logger.error('🔒 All security tokens invalidated due to emergency lockdown');
  }

  // Health check
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    activeTokens: number;
    tokenExpirationRate: number;
    headerValidationRate: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (this.securityTokens.size > 1000) {
      issues.push('High number of active security tokens');
      status = 'warning';
    }

    // Check for expired tokens (placeholder logic)
    const expiredTokens = Array.from(this.securityTokens.values())
      .filter(token => Date.now() > token.expires).length;

    if (expiredTokens > this.securityTokens.size * 0.1) {
      issues.push(`${expiredTokens} expired tokens need cleanup`);
      status = 'warning';
    }

    return {
      status,
      activeTokens: this.securityTokens.size,
      tokenExpirationRate: expiredTokens / Math.max(this.securityTokens.size, 1),
      headerValidationRate: 0.99, // Placeholder
      issues
    };
  }
}

export const secureHeadersManager = SecureHeadersManager.getInstance();
