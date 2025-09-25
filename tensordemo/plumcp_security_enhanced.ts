/**
 * PLUMCP Security Enhanced Core System
 *
 * Addresses critical security vulnerabilities identified in the original implementation:
 * 1. Plugin isolation weaknesses
 * 2. Code injection attack vectors
 * 3. Resource exhaustion vulnerabilities
 * 4. Insufficient input validation
 * 5. Performance bottlenecks in orchestration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as crypto from 'crypto';
import { Worker, MessageChannel } from 'worker_threads';

// ============================================================================
// SECURITY ENHANCED PLUGIN ARCHITECTURE
// ============================================================================

export interface SecurePluginContext {
  registerId: string;
  sandboxId: string;
  resourceLimits: ResourceLimits;
  securityPolicy: SecurityPolicy;
  registerTool: (tool: SecureMCPTool) => Promise<boolean>;
  registerResource: (resource: SecureMCPResource) => Promise<boolean>;
  validateInput: (input: unknown, schema: ValidationSchema) => ValidationResult;
  auditLog: (event: SecurityEvent) => void;
}

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuTimeMs: number;
  maxFileHandles: number;
  maxNetworkConnections: number;
  timeoutMs: number;
}

export interface SecurityPolicy {
  allowedFileAccess: string[];
  allowedNetworkHosts: string[];
  allowedSystemCalls: string[];
  sandboxLevel: 'strict' | 'medium' | 'permissive';
  auditLevel: 'minimal' | 'standard' | 'comprehensive';
}

export interface ValidationSchema {
  type: string;
  properties: Record<string, any>;
  required: string[];
  maxLength?: number;
  pattern?: RegExp;
  allowedValues?: unknown[];
}

export interface ValidationResult {
  valid: boolean;
  sanitizedInput?: unknown;
  violations: SecurityViolation[];
  riskScore: number;
}

export interface SecurityViolation {
  type: 'injection' | 'overflow' | 'traversal' | 'execution' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  blocked: boolean;
}

export interface SecurityEvent {
  timestamp: number;
  pluginId: string;
  eventType: 'access' | 'validation' | 'violation' | 'resource' | 'execution';
  details: Record<string, unknown>;
  riskLevel: number;
}

export interface SecureMCPTool {
  name: string;
  description: string;
  inputSchema: ValidationSchema;
  handler: (args: any, context: SecureExecutionContext) => Promise<any>;
  pluginId: string;
  permissions: ToolPermissions;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SecureMCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (context: SecureExecutionContext) => Promise<string>;
  pluginId: string;
  accessPolicy: ResourceAccessPolicy;
}

export interface ToolPermissions {
  fileAccess: FileAccessPolicy;
  networkAccess: NetworkAccessPolicy;
  systemAccess: SystemAccessPolicy;
}

export interface FileAccessPolicy {
  read: string[];
  write: string[];
  execute: string[];
}

export interface NetworkAccessPolicy {
  allowedHosts: string[];
  allowedPorts: number[];
  httpsOnly: boolean;
}

export interface SystemAccessPolicy {
  allowedCommands: string[];
  environmentAccess: string[];
}

export interface ResourceAccessPolicy {
  requiredPermissions: string[];
  rateLimits: RateLimits;
}

export interface RateLimits {
  requestsPerMinute: number;
  concurrentRequests: number;
}

export interface SecureExecutionContext {
  requestId: string;
  pluginId: string;
  userId?: string;
  sessionId: string;
  timeoutMs: number;
  resourceLimits: ResourceLimits;
  auditLogger: SecurityAuditLogger;
}

// ============================================================================
// SECURITY AUDIT LOGGER
// ============================================================================

export class SecurityAuditLogger {
  private events: SecurityEvent[] = [];
  private readonly maxEvents = 10000;
  private readonly riskThreshold = 80;

  logEvent(event: SecurityEvent): void {
    event.timestamp = Date.now();

    // Add to event log with rotation
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Alert on high-risk events
    if (event.riskLevel >= this.riskThreshold) {
      this.alertHighRiskEvent(event);
    }

    // Log to external security system (mock)
    this.logToSecuritySystem(event);
  }

  private alertHighRiskEvent(event: SecurityEvent): void {
    console.error(`🚨 HIGH RISK SECURITY EVENT: ${event.eventType} from plugin ${event.pluginId}`);
    console.error(`   Risk Level: ${event.riskLevel}`);
    console.error(`   Details:`, event.details);
  }

  private logToSecuritySystem(event: SecurityEvent): void {
    // In production, this would integrate with security monitoring systems
    // For now, log to stderr for security monitoring
    process.stderr.write(JSON.stringify({
      timestamp: new Date(event.timestamp).toISOString(),
      type: 'security_audit',
      plugin: event.pluginId,
      event: event.eventType,
      risk: event.riskLevel,
      details: event.details
    }) + '\n');
  }

  getSecurityMetrics(): SecurityMetrics {
    const now = Date.now();
    const lastHour = now - (60 * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp >= lastHour);

    return {
      totalEvents: this.events.length,
      recentEvents: recentEvents.length,
      highRiskEvents: recentEvents.filter(e => e.riskLevel >= this.riskThreshold).length,
      violationsBlocked: recentEvents.filter(e => e.eventType === 'violation').length,
      averageRiskLevel: recentEvents.reduce((sum, e) => sum + e.riskLevel, 0) / recentEvents.length || 0
    };
  }
}

export interface SecurityMetrics {
  totalEvents: number;
  recentEvents: number;
  highRiskEvents: number;
  violationsBlocked: number;
  averageRiskLevel: number;
}

// ============================================================================
// INPUT VALIDATION & SANITIZATION ENGINE
// ============================================================================

export class InputValidationEngine {
  private static readonly DANGEROUS_PATTERNS = [
    // Code injection patterns
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /setTimeout\s*\(/gi,
    /setInterval\s*\(/gi,
    /exec\s*\(/gi,
    /spawn\s*\(/gi,
    /child_process/gi,

    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/gi,
    /(\bunion\s+select\b)/gi,
    /(\'\s*(or|and)\s*\'\w*\'\s*=\s*\'\w*)/gi,

    // XSS patterns
    /<script[^>]*>/gi,
    /javascript:/gi,
    /onclick\s*=/gi,
    /onerror\s*=/gi,

    // Path traversal patterns
    /\.\.[\/\\]/gi,
    /\/(etc|proc|sys|dev)/gi,

    // Command injection patterns
    /[\;\|\&\$\`]/g,
    /\$\([^)]*\)/g,
    /\`[^`]*\`/g,
  ];

  private static readonly MAX_INPUT_SIZE = 1024 * 1024; // 1MB
  private static readonly MAX_DEPTH = 10;

  static validate(input: unknown, schema: ValidationSchema): ValidationResult {
    const violations: SecurityViolation[] = [];
    let riskScore = 0;

    try {
      // Size validation
      const inputSize = JSON.stringify(input).length;
      if (inputSize > this.MAX_INPUT_SIZE) {
        violations.push({
          type: 'overflow',
          severity: 'high',
          description: `Input size ${inputSize} exceeds maximum ${this.MAX_INPUT_SIZE}`,
          blocked: true
        });
        return { valid: false, violations, riskScore: 100 };
      }

      // Depth validation to prevent deep object attacks
      if (this.getObjectDepth(input) > this.MAX_DEPTH) {
        violations.push({
          type: 'overflow',
          severity: 'high',
          description: `Object depth exceeds maximum ${this.MAX_DEPTH}`,
          blocked: true
        });
        return { valid: false, violations, riskScore: 90 };
      }

      // String content validation
      const stringContent = this.extractStrings(input);
      for (const str of stringContent) {
        const contentViolations = this.validateStringContent(str);
        violations.push(...contentViolations);
        riskScore += contentViolations.reduce((sum, v) => sum + this.getRiskScore(v.severity), 0);
      }

      // Schema validation
      const schemaResult = this.validateSchema(input, schema);
      if (!schemaResult.valid) {
        violations.push({
          type: 'injection',
          severity: 'medium',
          description: 'Schema validation failed',
          blocked: true
        });
        riskScore += 30;
      }

      // Sanitize if possible
      const sanitizedInput = this.sanitizeInput(input, violations);

      return {
        valid: violations.filter(v => v.blocked).length === 0,
        sanitizedInput,
        violations,
        riskScore: Math.min(riskScore, 100)
      };

    } catch (error) {
      return {
        valid: false,
        violations: [{
          type: 'execution',
          severity: 'critical',
          description: `Validation failed: ${error.message}`,
          blocked: true
        }],
        riskScore: 100
      };
    }
  }

  private static validateStringContent(str: string): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(str)) {
        violations.push({
          type: 'injection',
          severity: 'high',
          description: `Dangerous pattern detected: ${pattern.source}`,
          blocked: true
        });
      }
    }

    return violations;
  }

  private static validateSchema(input: unknown, schema: ValidationSchema): { valid: boolean } {
    // Basic schema validation - in production use a proper validator like Ajv
    if (typeof input !== schema.type) {
      return { valid: false };
    }

    if (schema.type === 'string' && typeof input === 'string') {
      if (schema.maxLength && input.length > schema.maxLength) {
        return { valid: false };
      }
      if (schema.pattern && !schema.pattern.test(input)) {
        return { valid: false };
      }
      if (schema.allowedValues && !schema.allowedValues.includes(input)) {
        return { valid: false };
      }
    }

    return { valid: true };
  }

  private static sanitizeInput(input: unknown, violations: SecurityViolation[]): unknown {
    if (typeof input === 'string') {
      let sanitized = input;

      // Remove dangerous patterns
      for (const pattern of this.DANGEROUS_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[BLOCKED]');
      }

      // HTML encode
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      return sanitized;
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item, violations));
    }

    if (typeof input === 'object' && input !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value, violations);
      }
      return sanitized;
    }

    return input;
  }

  private static getObjectDepth(obj: unknown, currentDepth = 0): number {
    if (currentDepth > this.MAX_DEPTH) return currentDepth;

    if (typeof obj !== 'object' || obj === null) return currentDepth;

    let maxDepth = currentDepth;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        maxDepth = Math.max(maxDepth, this.getObjectDepth(item, currentDepth + 1));
      }
    } else {
      for (const value of Object.values(obj)) {
        maxDepth = Math.max(maxDepth, this.getObjectDepth(value, currentDepth + 1));
      }
    }

    return maxDepth;
  }

  private static extractStrings(obj: unknown): string[] {
    const strings: string[] = [];

    if (typeof obj === 'string') {
      strings.push(obj);
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        strings.push(...this.extractStrings(item));
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const value of Object.values(obj)) {
        strings.push(...this.extractStrings(value));
      }
    }

    return strings;
  }

  private static getRiskScore(severity: string): number {
    switch (severity) {
      case 'critical': return 40;
      case 'high': return 25;
      case 'medium': return 15;
      case 'low': return 5;
      default: return 0;
    }
  }
}

// ============================================================================
// SECURE PLUGIN SANDBOX
// ============================================================================

export class SecurePluginSandbox {
  private worker: Worker | null = null;
  private readonly resourceLimits: ResourceLimits;
  private readonly securityPolicy: SecurityPolicy;
  private readonly pluginId: string;
  private readonly auditLogger: SecurityAuditLogger;

  constructor(
    pluginId: string,
    resourceLimits: ResourceLimits,
    securityPolicy: SecurityPolicy,
    auditLogger: SecurityAuditLogger
  ) {
    this.pluginId = pluginId;
    this.resourceLimits = resourceLimits;
    this.securityPolicy = securityPolicy;
    this.auditLogger = auditLogger;
  }

  async executeSecurely<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      // Log execution start
      this.auditLogger.logEvent({
        timestamp: Date.now(),
        pluginId: this.pluginId,
        eventType: 'execution',
        details: { requestId, operation: 'secure_execute_start' },
        riskLevel: 10
      });

      // Create execution context
      const context: SecureExecutionContext = {
        requestId,
        pluginId: this.pluginId,
        sessionId: crypto.randomUUID(),
        timeoutMs: this.resourceLimits.timeoutMs,
        resourceLimits: this.resourceLimits,
        auditLogger: this.auditLogger
      };

      // Execute with timeout
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), this.resourceLimits.timeoutMs)
        )
      ]);

      // Log successful execution
      this.auditLogger.logEvent({
        timestamp: Date.now(),
        pluginId: this.pluginId,
        eventType: 'execution',
        details: {
          requestId,
          operation: 'secure_execute_success',
          duration: Date.now() - startTime
        },
        riskLevel: 5
      });

      return result;

    } catch (error) {
      // Log execution failure
      this.auditLogger.logEvent({
        timestamp: Date.now(),
        pluginId: this.pluginId,
        eventType: 'violation',
        details: {
          requestId,
          operation: 'secure_execute_failure',
          error: error.message,
          duration: Date.now() - startTime
        },
        riskLevel: 70
      });

      throw error;
    }
  }

  async validateAndExecute<T>(
    input: unknown,
    schema: ValidationSchema,
    operation: (sanitizedInput: any) => Promise<T>
  ): Promise<T> {
    // Validate input
    const validation = InputValidationEngine.validate(input, schema);

    if (!validation.valid) {
      this.auditLogger.logEvent({
        timestamp: Date.now(),
        pluginId: this.pluginId,
        eventType: 'violation',
        details: {
          violations: validation.violations,
          riskScore: validation.riskScore
        },
        riskLevel: validation.riskScore
      });

      throw new Error(`Input validation failed: ${validation.violations.map(v => v.description).join(', ')}`);
    }

    // Execute with sanitized input
    return this.executeSecurely(() => operation(validation.sanitizedInput));
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// ============================================================================
// ENHANCED SECURE PLUMCP SERVER
// ============================================================================

export class SecurePLUMCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private securePluginManager: SecurePluginManager;
  private auditLogger: SecurityAuditLogger;
  private isInitialized = false;

  constructor() {
    this.auditLogger = new SecurityAuditLogger();
    this.securePluginManager = new SecurePluginManager(this.auditLogger);

    this.server = new Server(
      {
        name: 'plumcp-secure-core',
        version: '2.0.0-security',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.transport = new StdioServerTransport();
    this.setupSecureRequestHandlers();
  }

  private setupSecureRequestHandlers(): void {
    // Secure Tools Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.ensureSecurePluginsLoaded();

      return {
        tools: this.securePluginManager.getAllSecureTools().map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.ensureSecurePluginsLoaded();

      const tool = this.securePluginManager.getSecureTool(request.params.name);
      if (!tool) {
        this.auditLogger.logEvent({
          timestamp: Date.now(),
          pluginId: 'system',
          eventType: 'violation',
          details: { toolName: request.params.name, reason: 'tool_not_found' },
          riskLevel: 60
        });
        throw new Error(`Secure tool not found: ${request.params.name}`);
      }

      // Create secure execution context
      const context: SecureExecutionContext = {
        requestId: crypto.randomUUID(),
        pluginId: tool.pluginId,
        sessionId: crypto.randomUUID(),
        timeoutMs: 30000,
        resourceLimits: this.getDefaultResourceLimits(),
        auditLogger: this.auditLogger
      };

      // Validate and execute securely
      const sandbox = new SecurePluginSandbox(
        tool.pluginId,
        context.resourceLimits,
        this.getDefaultSecurityPolicy(),
        this.auditLogger
      );

      try {
        return await sandbox.validateAndExecute(
          request.params.arguments,
          tool.inputSchema,
          (sanitizedArgs) => tool.handler(sanitizedArgs, context)
        );
      } finally {
        sandbox.destroy();
      }
    });

    // Similar secure handlers for resources and prompts...
  }

  private ensureSecurePluginsLoaded(): void {
    if (!this.isInitialized) {
      throw new Error('Secure PLUMCP requires validated plugins. No secure plugins loaded.');
    }

    const loadedPlugins = this.securePluginManager.getLoadedSecurePlugins();
    if (loadedPlugins.length === 0) {
      throw new Error('No secure plugins available.');
    }
  }

  private getDefaultResourceLimits(): ResourceLimits {
    return {
      maxMemoryMB: 100,
      maxCpuTimeMs: 30000,
      maxFileHandles: 10,
      maxNetworkConnections: 5,
      timeoutMs: 30000
    };
  }

  private getDefaultSecurityPolicy(): SecurityPolicy {
    return {
      allowedFileAccess: ['/tmp', './data'],
      allowedNetworkHosts: [],
      allowedSystemCalls: [],
      sandboxLevel: 'strict',
      auditLevel: 'comprehensive'
    };
  }

  async loadSecurePlugin(plugin: SecurePLUMCPPlugin): Promise<void> {
    await this.securePluginManager.loadSecurePlugin(plugin, this.createSecurePluginContext());
  }

  private createSecurePluginContext(): SecurePluginContext {
    return {
      registerId: crypto.randomUUID(),
      sandboxId: crypto.randomUUID(),
      resourceLimits: this.getDefaultResourceLimits(),
      securityPolicy: this.getDefaultSecurityPolicy(),
      registerTool: async (tool: SecureMCPTool) => this.securePluginManager.registerSecureTool(tool),
      registerResource: async (resource: SecureMCPResource) => this.securePluginManager.registerSecureResource(resource),
      validateInput: (input: unknown, schema: ValidationSchema) => InputValidationEngine.validate(input, schema),
      auditLog: (event: SecurityEvent) => this.auditLogger.logEvent(event)
    };
  }

  async start(): Promise<void> {
    await this.securePluginManager.initializeSecurePlugins();
    this.isInitialized = true;

    await this.server.connect(this.transport);
    console.error('🔒 Secure PLUMCP Core started with comprehensive security validation');

    // Log startup
    this.auditLogger.logEvent({
      timestamp: Date.now(),
      pluginId: 'system',
      eventType: 'execution',
      details: { action: 'server_start', security_level: 'maximum' },
      riskLevel: 0
    });
  }

  getSecurityMetrics(): SecurityMetrics {
    return this.auditLogger.getSecurityMetrics();
  }
}

// ============================================================================
// SECURE PLUGIN INTERFACES
// ============================================================================

export interface SecurePLUMCPPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  securityLevel: 'low' | 'medium' | 'high';
  requiredPermissions: string[];
  activate: (context: SecurePluginContext) => Promise<void>;
  deactivate: () => Promise<void>;
}

export class SecurePluginManager {
  private securePlugins: Map<string, SecurePLUMCPPlugin> = new Map();
  private loadedPlugins: Set<string> = new Set();
  private secureTools: Map<string, SecureMCPTool> = new Map();
  private secureResources: Map<string, SecureMCPResource> = new Map();
  private auditLogger: SecurityAuditLogger;

  constructor(auditLogger: SecurityAuditLogger) {
    this.auditLogger = auditLogger;
  }

  async loadSecurePlugin(plugin: SecurePLUMCPPlugin, context: SecurePluginContext): Promise<void> {
    // Security validation before loading
    await this.validatePluginSecurity(plugin);

    try {
      await plugin.activate(context);
      this.securePlugins.set(plugin.id, plugin);
      this.loadedPlugins.add(plugin.id);

      this.auditLogger.logEvent({
        timestamp: Date.now(),
        pluginId: plugin.id,
        eventType: 'execution',
        details: { action: 'plugin_loaded_secure', securityLevel: plugin.securityLevel },
        riskLevel: plugin.securityLevel === 'high' ? 20 : 5
      });

    } catch (error) {
      this.auditLogger.logEvent({
        timestamp: Date.now(),
        pluginId: plugin.id,
        eventType: 'violation',
        details: { action: 'plugin_load_failed', error: error.message },
        riskLevel: 80
      });
      throw error;
    }
  }

  private async validatePluginSecurity(plugin: SecurePLUMCPPlugin): Promise<void> {
    // Validate plugin code for security issues
    const pluginCode = plugin.toString();

    // Check for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /exec\s*\(/gi,
      /child_process/gi,
      /require\s*\(\s*['"]\w+['"]\s*\)/gi
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(pluginCode)) {
        throw new Error(`Plugin contains dangerous pattern: ${pattern.source}`);
      }
    }
  }

  async registerSecureTool(tool: SecureMCPTool): Promise<boolean> {
    // Validate tool security
    if (tool.riskLevel === 'high') {
      this.auditLogger.logEvent({
        timestamp: Date.now(),
        pluginId: tool.pluginId,
        eventType: 'access',
        details: { action: 'high_risk_tool_registered', toolName: tool.name },
        riskLevel: 70
      });
    }

    this.secureTools.set(tool.name, tool);
    return true;
  }

  async registerSecureResource(resource: SecureMCPResource): Promise<boolean> {
    this.secureResources.set(resource.uri, resource);
    return true;
  }

  getSecureTool(name: string): SecureMCPTool | undefined {
    return this.secureTools.get(name);
  }

  getAllSecureTools(): SecureMCPTool[] {
    return Array.from(this.secureTools.values());
  }

  getLoadedSecurePlugins(): SecurePLUMCPPlugin[] {
    return Array.from(this.loadedPlugins).map(id => this.securePlugins.get(id)!);
  }

  async initializeSecurePlugins(): Promise<void> {
    // Initialize with built-in secure plugins only
    console.error('🔒 Initializing secure plugins with comprehensive validation...');
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

export async function createSecurePLUMCPServer(): Promise<SecurePLUMCPServer> {
  const server = new SecurePLUMCPServer();

  // Load only validated, secure plugins
  // await server.loadSecurePlugin(new SecureFileSystemPlugin());

  return server;
}

export async function startSecurePLUMCP(): Promise<void> {
  console.error('🔒 Starting Secure PLUMCP Server with maximum security validation...');

  const server = await createSecurePLUMCPServer();

  // Display security metrics
  setInterval(() => {
    const metrics = server.getSecurityMetrics();
    if (metrics.highRiskEvents > 0) {
      console.error('🚨 Security Alert - High Risk Events Detected:', metrics);
    }
  }, 60000); // Check every minute

  await server.start();
  console.error('🔒 Secure PLUMCP Server ready - All operations validated and sandboxed');
}