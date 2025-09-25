/**
 * Security Enhancements Plugin for PLUMCP
 *
 * Addresses critical security vulnerabilities identified in VRP reports:
 * - Command injection prevention
 * - Path traversal protection
 * - Input sanitization
 * - Credential protection
 * - SAPISID/session security
 */

import { PLUMCPPlugin, PluginContext, MCPTool, MCPResource } from './plumcp_plugins.js';

export class CommandInjectionProtector implements PLUMCPPlugin {
  id = 'command-injection-protector';
  name = 'Command Injection Protection Plugin';
  version = '1.0.0';
  description = 'Prevents command injection attacks in CLI tools and subprocess execution';
  capabilities = [{ type: 'tool' as const, name: 'sanitize_command', description: 'Sanitize and validate shell commands' }];
  dependencies = [];

  private dangerousPatterns = [
    /[;&|`$(){}[\]<>]/,  // Shell metacharacters
    /\\\$\w+/,           // Environment variable expansion
    /\\\$\{[^}]+\}/,     // Brace expansion
    /\\\$\([^)]+\)/,     // Command substitution
    /`[^`]+`/,           // Backtick command execution
    /\$\([^(]+\)/,       // Dollar command substitution
  ];

  activate(context: PluginContext): Promise<void> {
    context.registerTool({
      name: 'sanitize_command',
      description: 'Sanitize shell commands to prevent injection attacks',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          allowEnvVars: { type: 'boolean', default: false },
          allowPaths: { type: 'boolean', default: true }
        }
      },
      handler: async (args) => {
        const { command, args: cmdArgs = [], allowEnvVars = false, allowPaths = true } = args;

        // Validate command structure
        if (!command || typeof command !== 'string') {
          throw new Error('Invalid command: must be non-empty string');
        }

        // Check for dangerous patterns
        for (const pattern of this.dangerousPatterns) {
          if (pattern.test(command)) {
            throw new Error(`Command injection detected: ${pattern.source}`);
          }
        }

        // Validate arguments
        for (const arg of cmdArgs) {
          if (typeof arg !== 'string') {
            throw new Error('All command arguments must be strings');
          }

          // Check arguments for injection patterns
          if (!allowEnvVars && arg.includes('$')) {
            throw new Error('Environment variable expansion not allowed in arguments');
          }

          if (!allowPaths && (arg.includes('..') || arg.startsWith('/'))) {
            throw new Error('Path traversal not allowed in arguments');
          }
        }

        return {
          sanitized: true,
          command,
          args: cmdArgs,
          safe: true,
          validationPassed: true
        };
      }
    });

    return Promise.resolve();
  }

  deactivate(): Promise<void> {
    return Promise.resolve();
  }
}

export class PathTraversalProtector implements PLUMCPPlugin {
  id = 'path-traversal-protector';
  name = 'Path Traversal Protection Plugin';
  version = '1.0.0';
  description = 'Prevents path traversal attacks in file system operations';
  capabilities = [{ type: 'tool' as const, name: 'validate_path', description: 'Validate file paths for security' }];
  dependencies = [];

  private traversalPatterns = [
    /\.\.[\/\\]/,       // Directory traversal
    /^[\/\\]/,          // Absolute paths
    /[\/\\]\.\.[\/\\]/, // Embedded traversal
    /\.\.$/,            // Double dot at end
  ];

  private allowedBasePaths = [
    './',
    '.\\',
    process.cwd(),
    // Add more allowed base paths as needed
  ];

  activate(context: PluginContext): Promise<void> {
    context.registerTool({
      name: 'validate_path',
      description: 'Validate file paths to prevent traversal attacks',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          operation: { type: 'string', enum: ['read', 'write', 'execute'] },
          allowAbsolute: { type: 'boolean', default: false }
        }
      },
      handler: async (args) => {
        const { path, operation, allowAbsolute = false } = args;

        if (!path || typeof path !== 'string') {
          throw new Error('Invalid path: must be non-empty string');
        }

        // Normalize path separators
        const normalizedPath = path.replace(/\\/g, '/');

        // Check for traversal patterns
        for (const pattern of this.traversalPatterns) {
          if (pattern.test(normalizedPath)) {
            throw new Error(`Path traversal detected: ${path}`);
          }
        }

        // Check absolute paths
        if (!allowAbsolute && (normalizedPath.startsWith('/') || /^[A-Z]:/.test(normalizedPath))) {
          throw new Error(`Absolute paths not allowed: ${path}`);
        }

        // Validate against allowed base paths
        const isAllowedBase = this.allowedBasePaths.some(base =>
          normalizedPath.startsWith(base.replace(/\\/g, '/'))
        );

        if (!isAllowedBase && !normalizedPath.startsWith('./') && !normalizedPath.startsWith('.\\')) {
          throw new Error(`Path outside allowed directories: ${path}`);
        }

        // Additional operation-specific checks
        if (operation === 'execute' && !normalizedPath.includes('.')) {
          throw new Error('Executable paths must include file extension');
        }

        return {
          validated: true,
          path: normalizedPath,
          operation,
          safe: true,
          canonicalPath: require('path').resolve(normalizedPath)
        };
      }
    });

    return Promise.resolve();
  }

  deactivate(): Promise<void> {
    return Promise.resolve();
  }
}

export class CredentialProtector implements PLUMCPPlugin {
  id = 'credential-protector';
  name = 'Credential Protection Plugin';
  version = '1.0.0';
  description = 'Protects sensitive credentials and prevents exposure';
  capabilities = [
    { type: 'tool' as const, name: 'scan_credentials', description: 'Scan for exposed credentials' },
    { type: 'tool' as const, name: 'secure_storage', description: 'Secure credential storage' }
  ];
  dependencies = [];

  private credentialPatterns = [
    /password\s*[:=]\s*['"]?([^'"\s]+)['"]?/i,
    /api[_-]?key\s*[:=]\s*['"]?([^'"\s]+)['"]?/i,
    /secret\s*[:=]\s*['"]?([^'"\s]+)['"]?/i,
    /token\s*[:=]\s*['"]?([^'"\s]+)['"]?/i,
    /Bearer\s+([A-Za-z0-9+/=]+)/i,
    /Authorization:\s*Bearer\s+([A-Za-z0-9+/=]+)/i,
  ];

  activate(context: PluginContext): Promise<void> {
    context.registerTool({
      name: 'scan_credentials',
      description: 'Scan content for potentially exposed credentials',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          filePath: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }
        }
      },
      handler: async (args) => {
        const { content, filePath, severity = 'medium' } = args;
        const findings: any[] = [];

        for (const pattern of this.credentialPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            findings.push({
              pattern: pattern.source,
              match: matches[0],
              value: matches[1] || matches[0],
              severity: this.assessSeverity(matches[0], severity),
              line: content.substring(0, matches.index).split('\n').length
            });
          }
        }

        return {
          scanned: true,
          filePath,
          findings,
          totalFindings: findings.length,
          hasHighRisk: findings.some(f => f.severity === 'high'),
          recommendations: this.generateRecommendations(findings)
        };
      }
    });

    context.registerTool({
      name: 'secure_storage',
      description: 'Securely store and retrieve credentials',
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['store', 'retrieve', 'delete'] },
          key: { type: 'string' },
          value: { type: 'string' },
          encrypt: { type: 'boolean', default: true }
        }
      },
      handler: async (args) => {
        const { operation, key, value, encrypt = true } = args;

        // In a real implementation, this would use secure storage
        // For now, we'll simulate with warnings
        if (operation === 'store') {
          console.warn('⚠️  Secure credential storage not fully implemented');
          console.warn('🔒 Recommendation: Use system keyring or encrypted storage');

          return {
            operation: 'store',
            key,
            stored: true,
            encrypted: encrypt,
            location: 'simulated_secure_storage',
            warning: 'Using simulated storage - implement proper secure storage'
          };
        }

        return {
          operation,
          key,
          error: 'Secure storage not implemented',
          recommendation: 'Implement system keyring integration'
        };
      }
    });

    return Promise.resolve();
  }

  private assessSeverity(match: string, baseSeverity: string): string {
    if (match.toLowerCase().includes('password') ||
        match.toLowerCase().includes('secret') ||
        match.includes('Bearer')) {
      return 'high';
    }
    if (match.toLowerCase().includes('api') ||
        match.toLowerCase().includes('token')) {
      return 'medium';
    }
    return baseSeverity;
  }

  private generateRecommendations(findings: any[]): string[] {
    const recommendations: string[] = [];

    if (findings.some(f => f.severity === 'high')) {
      recommendations.push('🚨 HIGH PRIORITY: Remove exposed high-risk credentials immediately');
      recommendations.push('🔐 Use environment variables or secure vaults for secrets');
    }

    if (findings.length > 0) {
      recommendations.push('📝 Audit all credential usage and rotate exposed values');
      recommendations.push('🛡️ Implement credential scanning in CI/CD pipeline');
      recommendations.push('🔒 Use .gitignore to prevent committing sensitive files');
    }

    return recommendations;
  }

  deactivate(): Promise<void> {
    return Promise.resolve();
  }
}

export class SAPISIDProtector implements PLUMCPPlugin {
  id = 'sapisid-protector';
  name = 'SAPISID Security Plugin';
  version = '1.0.0';
  description = 'Protects against SAPISID cookie theft and forgery attacks';
  capabilities = [
    { type: 'tool' as const, name: 'validate_session', description: 'Validate session security' },
    { type: 'tool' as const, name: 'detect_sapisid_exposure', description: 'Detect SAPISID exposure risks' }
  ];
  dependencies = [];

  activate(context: PluginContext): Promise<void> {
    context.registerTool({
      name: 'validate_session',
      description: 'Validate session tokens and headers for security',
      inputSchema: {
        type: 'object',
        properties: {
          headers: { type: 'object' },
          origin: { type: 'string' },
          userAgent: { type: 'string' }
        }
      },
      handler: async (args) => {
        const { headers, origin, userAgent } = args;
        const issues: string[] = [];

        // Check for SAPISIDHASH header
        if (headers && headers['authorization']) {
          const authHeader = headers['authorization'];

          if (authHeader.includes('SAPISIDHASH')) {
            // Validate SAPISIDHASH format and timing
            const hashMatch = authHeader.match(/SAPISIDHASH\s+(\d+)_([A-Za-z0-9+/=]+)/);
            if (hashMatch) {
              const timestamp = parseInt(hashMatch[1]);
              const currentTime = Math.floor(Date.now() / 1000);

              // Check if timestamp is reasonable (within 5 minutes)
              if (Math.abs(currentTime - timestamp) > 300) {
                issues.push('SAPISIDHASH timestamp is too old or too new');
              }
            } else {
              issues.push('Invalid SAPISIDHASH format');
            }
          }
        }

        // Check origin validation
        if (origin && !this.isValidOrigin(origin)) {
          issues.push(`Suspicious origin: ${origin}`);
        }

        // Check user agent consistency
        if (userAgent && !this.isValidUserAgent(userAgent)) {
          issues.push(`Suspicious user agent: ${userAgent}`);
        }

        return {
          validated: true,
          issues,
          riskLevel: issues.length > 0 ? 'high' : 'low',
          recommendations: this.generateSessionRecommendations(issues)
        };
      }
    });

    context.registerTool({
      name: 'detect_sapisid_exposure',
      description: 'Detect potential SAPISID exposure in code and configs',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          filePath: { type: 'string' }
        }
      },
      handler: async (args) => {
        const { content, filePath } = args;
        const exposures: any[] = [];

        // Look for SAPISID references
        const sapisidPatterns = [
          /SAPISID[^=]*=\s*['"]?([^'";\s]+)/gi,
          /sapisid[^=]*=\s*['"]?([^'";\s]+)/gi,
          /SAPISIDHASH[^=]*=\s*['"]?([^'";\s]+)/gi,
        ];

        for (const pattern of sapisidPatterns) {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            exposures.push({
              type: 'SAPISID Exposure',
              value: match[1],
              line: content.substring(0, match.index).split('\n').length,
              context: match[0].substring(0, 50) + '...'
            });
          }
        }

        // Look for cookie database references
        if (content.includes('Cookies') || content.includes('cookies.sqlite')) {
          exposures.push({
            type: 'Cookie Database Access',
            severity: 'high',
            description: 'Code accesses browser cookie storage'
          });
        }

        return {
          scanned: true,
          filePath,
          exposures,
          totalExposures: exposures.length,
          riskLevel: exposures.length > 0 ? 'critical' : 'low',
          recommendations: this.generateSAPISIDRecommendations(exposures)
        };
      }
    });

    return Promise.resolve();
  }

  private isValidOrigin(origin: string): boolean {
    const allowedOrigins = [
      'https://aistudio.google.com',
      'https://makersuite.google.com',
      'https://colab.research.google.com',
      // Add other legitimate Google AI/ML origins
    ];

    return allowedOrigins.some(allowed => origin.startsWith(allowed));
  }

  private isValidUserAgent(userAgent: string): boolean {
    // Basic validation - should contain legitimate browser signatures
    const suspiciousPatterns = [
      /curl/i,
      /wget/i,
      /python/i,
      /bot/i,
      /crawler/i
    ];

    return !suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  private generateSessionRecommendations(issues: string[]): string[] {
    const recommendations: string[] = [];

    if (issues.some(i => i.includes('timestamp'))) {
      recommendations.push('⏰ Implement proper timestamp validation for SAPISIDHASH');
    }

    if (issues.some(i => i.includes('origin'))) {
      recommendations.push('🌐 Enforce strict origin validation for API requests');
    }

    if (issues.some(i => i.includes('user agent'))) {
      recommendations.push('🤖 Implement user agent validation and rate limiting');
    }

    if (issues.length === 0) {
      recommendations.push('✅ Session validation passed - continue monitoring');
    }

    return recommendations;
  }

  private generateSAPISIDRecommendations(exposures: any[]): string[] {
    const recommendations: string[] = [];

    if (exposures.some(e => e.type === 'SAPISID Exposure')) {
      recommendations.push('🚨 CRITICAL: Remove all SAPISID references from code and configs');
      recommendations.push('🔒 Never store or log SAPISID values');
    }

    if (exposures.some(e => e.type === 'Cookie Database Access')) {
      recommendations.push('🍪 Remove direct cookie database access from application code');
      recommendations.push('🔐 Use secure browser APIs for cookie management');
    }

    recommendations.push('🛡️ Implement Content Security Policy (CSP) headers');
    recommendations.push('🔄 Regularly rotate session tokens and cookies');

    return recommendations;
  }

  deactivate(): Promise<void> {
    return Promise.resolve();
  }
}

// Plugin Registry for Security Enhancements
export const SecurityEnhancementPlugins = [
  CommandInjectionProtector,
  PathTraversalProtector,
  CredentialProtector,
  SAPISIDProtector
];

export function createSecurityEnhancedPLUMCP() {
  return {
    plugins: SecurityEnhancementPlugins.map(PluginClass => new PluginClass()),
    description: 'Security-enhanced PLUMCP ecosystem with VRP vulnerability protections',
    capabilities: [
      'Command injection prevention',
      'Path traversal protection',
      'Credential exposure detection',
      'SAPISID/session security',
      'Input sanitization',
      'Secure file operations'
    ]
  };
}
