/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Cloud Escape Prevention - Prevents container/sandbox escape and cross-cloud attacks.
 *
 * SECURITY NOTE: Cloud escape vulnerabilities allow attackers to break out of
 * isolated environments (containers, VMs, sandboxes) and access:
 * - Host system resources
 * - Cloud provider credentials (AWS, GCP, Azure, Alibaba)
 * - Other containers/tenants
 * - Kubernetes secrets and service accounts
 * - Cloud metadata services
 *
 * This module provides comprehensive protection against cloud escape vectors.
 */

/**
 * Sensitive environment variables that should NEVER be passed to untrusted containers.
 */
const DANGEROUS_ENV_VARS = new Set([
  // AWS Credentials
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SECURITY_TOKEN',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_CONFIG_FILE',
  'AWS_PROFILE',
  'AWS_DEFAULT_PROFILE',
  'AWS_ROLE_ARN',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',

  // GCP Credentials
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'GCP_PROJECT',
  'CLOUDSDK_CORE_PROJECT',
  'CLOUDSDK_CONFIG',
  'GOOGLE_CLOUD_KEYFILE_JSON',

  // Azure Credentials
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_CLIENT_CERTIFICATE_PATH',
  'AZURE_USERNAME',
  'AZURE_PASSWORD',
  'AZURE_FEDERATED_TOKEN_FILE',
  'AZURE_AUTHORITY_HOST',
  'MSI_ENDPOINT',
  'MSI_SECRET',
  'IDENTITY_ENDPOINT',
  'IDENTITY_HEADER',

  // Alibaba Cloud
  'ALIBABA_CLOUD_ACCESS_KEY_ID',
  'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
  'ALIBABA_CLOUD_SECURITY_TOKEN',
  'ALICLOUD_ACCESS_KEY',
  'ALICLOUD_SECRET_KEY',

  // Kubernetes
  'KUBERNETES_SERVICE_HOST',
  'KUBERNETES_SERVICE_PORT',
  'KUBECONFIG',
  'KUBE_TOKEN',

  // Container Runtime
  'DOCKER_HOST',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
  'DOCKER_CONFIG',
  'PODMAN_HOST',

  // SSH & Authentication
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'SSH_CONNECTION',
  'SSH_CLIENT',
  'SSH_TTY',

  // General Secrets
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
  'NPM_TOKEN',
  'PYPI_TOKEN',
  'VAULT_TOKEN',
  'VAULT_ADDR',
  'DATABASE_URL',
  'DB_PASSWORD',
  'DB_CONNECTION_STRING',
  'REDIS_URL',
  'MONGODB_URI',

  // Path Manipulation (Container Escape)
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'DYLD_FALLBACK_LIBRARY_PATH',
  'DYLD_VERSIONED_LIBRARY_PATH',
  'DYLD_FALLBACK_FRAMEWORK_PATH',
  'DYLD_VERSIONED_FRAMEWORK_PATH',
  'LIBPATH',
  'SHLIB_PATH',

  // API Keys & Tokens
  'API_KEY',
  'AUTH_TOKEN',
  'ACCESS_TOKEN',
  'BEARER_TOKEN',
  'OAUTH_TOKEN',
  'REFRESH_TOKEN',
]);

/**
 * Sensitive file paths that should NEVER be mounted into containers.
 */
const DANGEROUS_MOUNT_PATHS = [
  // Cloud Provider Credentials
  '/.aws',
  '/.config/gcloud',
  '/.azure',
  '/.alibabacloud',
  '/.kube',
  '/.docker',

  // SSH Keys
  '/.ssh',

  // System Directories (Container Escape)
  '/proc',
  '/sys',
  '/dev',
  '/run',
  '/var/run',
  '/var/lib/docker',
  '/var/lib/kubelet',

  // Boot & Kernel
  '/boot',
  '/lib/modules',

  // System Configuration
  '/etc/passwd',
  '/etc/shadow',
  '/etc/group',
  '/etc/sudoers',
  '/etc/ssh',
  '/etc/pam.d',
  '/etc/security',

  // Sensitive Application Data
  '/.npmrc',
  '/.pypirc',
  '/.gitconfig',
  '/.netrc',
  '/.pgpass',
  '/.my.cnf',
];

/**
 * Docker/Podman capabilities that enable container escape.
 */
const DANGEROUS_CAPABILITIES = [
  'SYS_ADMIN',      // Can mount filesystems, load kernel modules
  'SYS_MODULE',     // Can load kernel modules
  'SYS_RAWIO',      // Can access /dev/mem, /dev/kmem
  'SYS_PTRACE',     // Can ptrace any process, read memory
  'SYS_BOOT',       // Can reboot system
  'DAC_OVERRIDE',   // Bypass file permission checks (partial)
  'DAC_READ_SEARCH', // Bypass read/execute permission checks
  'SETUID',         // Can set arbitrary UID
  'SETGID',         // Can set arbitrary GID
  'SETFCAP',        // Can set file capabilities
  'NET_ADMIN',      // Can modify network config (escape via network)
  'NET_RAW',        // Can create raw sockets (network sniffing)
];

/**
 * Docker security options that weaken isolation.
 */
const INSECURE_SECURITY_OPTIONS = [
  'apparmor=unconfined',
  'seccomp=unconfined',
  'label=disable',
  'no-new-privileges=false',
];

/**
 * Error thrown when cloud escape attempt is detected.
 */
export class CloudEscapeError extends Error {
  constructor(
    message: string,
    public readonly vector: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'CloudEscapeError';
  }
}

/**
 * Validates environment variable name is safe to pass to container.
 *
 * @param envVar Environment variable name
 * @returns True if safe, throws CloudEscapeError if dangerous
 */
export function validateEnvironmentVariable(envVar: string): boolean {
  const upperEnvVar = envVar.toUpperCase();

  // Check exact matches
  if (DANGEROUS_ENV_VARS.has(upperEnvVar)) {
    logConfigTamperingDetected(
      'Environment variable',
      `Blocked dangerous environment variable: ${envVar}`,
    );
    throw new CloudEscapeError(
      `Environment variable '${envVar}' cannot be passed to sandbox - cloud escape risk`,
      'ENVIRONMENT_VARIABLE',
      'This variable contains or provides access to cloud credentials',
    );
  }

  // Check patterns
  const dangerousPatterns = [
    /^AWS_/i,
    /^GOOGLE_/i,
    /^GCP_/i,
    /^GCLOUD_/i,
    /^AZURE_/i,
    /^ALIBABA_/i,
    /^ALICLOUD_/i,
    /_TOKEN$/i,
    /_KEY$/i,
    /_SECRET$/i,
    /_PASSWORD$/i,
    /_CREDENTIAL/i,
    /^KUBECONFIG$/i,
    /^DOCKER_/i,
    /^PODMAN_/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(envVar)) {
      logConfigTamperingDetected(
        'Environment variable',
        `Blocked environment variable matching dangerous pattern: ${envVar}`,
      );
      throw new CloudEscapeError(
        `Environment variable '${envVar}' matches dangerous pattern - cloud escape risk`,
        'ENVIRONMENT_VARIABLE_PATTERN',
        `Pattern: ${pattern}`,
      );
    }
  }

  return true;
}

/**
 * Validates mount path is safe to mount into container.
 *
 * @param mountPath Path to validate
 * @param allowReadOnly If true, read-only mounts of some paths may be allowed
 * @returns True if safe, throws CloudEscapeError if dangerous
 */
export function validateMountPath(
  mountPath: string,
  allowReadOnly: boolean = false,
): boolean {
  const normalizedPath = path.normalize(mountPath);
  const homeDir = os.homedir();

  // Check if mounting dangerous system paths
  for (const dangerousPath of DANGEROUS_MOUNT_PATHS) {
    const fullDangerousPath = dangerousPath.startsWith('/')
      ? dangerousPath
      : path.join(homeDir, dangerousPath);

    if (
      normalizedPath === fullDangerousPath ||
      normalizedPath.startsWith(fullDangerousPath + path.sep)
    ) {
      // Some paths might be acceptable as read-only
      const allowedReadOnly = [
        '/.config/gcloud',  // Can allow read-only for ADC
      ];

      if (allowReadOnly && allowedReadOnly.includes(dangerousPath)) {
        console.warn(
          `WARNING: Mounting sensitive path ${normalizedPath} as read-only. Ensure this is intentional.`,
        );
        return true;
      }

      logConfigTamperingDetected(
        'Mount path',
        `Blocked dangerous mount path: ${normalizedPath}`,
      );
      throw new CloudEscapeError(
        `Cannot mount '${normalizedPath}' - contains sensitive cloud credentials or system files`,
        'DANGEROUS_MOUNT_PATH',
        `Matches dangerous path: ${dangerousPath}`,
      );
    }
  }

  // Check for common credential files in the path
  const credentialFiles = [
    'credentials',
    'config',
    'id_rsa',
    'id_ed25519',
    'id_ecdsa',
    '.pem',
    '.key',
    '.p12',
    '.pfx',
    'kubeconfig',
  ];

  for (const credFile of credentialFiles) {
    if (normalizedPath.includes(credFile)) {
      logConfigTamperingDetected(
        'Mount path',
        `Potentially sensitive file in mount path: ${normalizedPath}`,
      );
      console.warn(
        `WARNING: Mount path ${normalizedPath} contains '${credFile}' - potential credential exposure`,
      );
    }
  }

  return true;
}

/**
 * Validates Docker/Podman capability is safe.
 *
 * @param capability Capability name (e.g., 'SYS_ADMIN')
 * @returns True if safe, throws CloudEscapeError if dangerous
 */
export function validateCapability(capability: string): boolean {
  const upperCap = capability.toUpperCase().replace(/^CAP_/, '');

  if (DANGEROUS_CAPABILITIES.includes(upperCap)) {
    logConfigTamperingDetected(
      'Container capability',
      `Blocked dangerous capability: ${capability}`,
    );
    throw new CloudEscapeError(
      `Capability '${capability}' enables container escape`,
      'DANGEROUS_CAPABILITY',
      'This capability allows breaking out of container isolation',
    );
  }

  return true;
}

/**
 * Validates Docker security options.
 *
 * @param securityOpt Security option string
 * @returns True if safe, throws CloudEscapeError if dangerous
 */
export function validateSecurityOption(securityOpt: string): boolean {
  const lowerOpt = securityOpt.toLowerCase();

  for (const insecureOpt of INSECURE_SECURITY_OPTIONS) {
    if (lowerOpt.includes(insecureOpt)) {
      logConfigTamperingDetected(
        'Security option',
        `Blocked insecure security option: ${securityOpt}`,
      );
      throw new CloudEscapeError(
        `Security option '${securityOpt}' weakens container isolation`,
        'INSECURE_SECURITY_OPTION',
        'This option disables important security features',
      );
    }
  }

  return true;
}

/**
 * Sanitizes environment variables before passing to container.
 * Returns only safe environment variables.
 *
 * @param env Environment object to sanitize
 * @returns Sanitized environment object
 */
export function sanitizeEnvironment(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const blocked: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;

    try {
      validateEnvironmentVariable(key);
      sanitized[key] = value;
    } catch (error) {
      if (error instanceof CloudEscapeError) {
        blocked.push(key);
      } else {
        throw error;
      }
    }
  }

  if (blocked.length > 0) {
    console.warn(
      `Blocked ${blocked.length} dangerous environment variables from container:`,
      blocked.join(', '),
    );
  }

  return sanitized;
}

/**
 * Validates Docker/Podman run arguments for escape vectors.
 *
 * @param args Array of docker/podman arguments
 * @returns True if safe, throws CloudEscapeError if dangerous
 */
export function validateContainerArgs(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    // Check for privileged mode
    if (arg === '--privileged') {
      logConfigTamperingDetected(
        'Container args',
        'Blocked --privileged flag',
      );
      throw new CloudEscapeError(
        'Cannot run container in privileged mode - enables complete escape',
        'PRIVILEGED_CONTAINER',
        'Privileged containers can access all host devices and bypass all restrictions',
      );
    }

    // Check for host network mode
    if (arg === '--network' && nextArg === 'host') {
      logConfigTamperingDetected(
        'Container args',
        'Blocked --network host',
      );
      throw new CloudEscapeError(
        'Cannot use host network mode - bypasses network isolation',
        'HOST_NETWORK',
        'Host network mode allows container to see all host network traffic',
      );
    }

    // Check for host PID namespace
    if (arg === '--pid' && nextArg === 'host') {
      logConfigTamperingDetected(
        'Container args',
        'Blocked --pid host',
      );
      throw new CloudEscapeError(
        'Cannot use host PID namespace - enables process injection',
        'HOST_PID',
        'Host PID namespace allows container to see and control host processes',
      );
    }

    // Check for host IPC namespace
    if (arg === '--ipc' && nextArg === 'host') {
      logConfigTamperingDetected(
        'Container args',
        'Blocked --ipc host',
      );
      throw new CloudEscapeError(
        'Cannot use host IPC namespace - enables shared memory access',
        'HOST_IPC',
        'Host IPC namespace allows access to host shared memory',
      );
    }

    // Check for capabilities
    if (arg === '--cap-add' && nextArg) {
      validateCapability(nextArg);
    }

    // Check for security options
    if (arg === '--security-opt' && nextArg) {
      validateSecurityOption(nextArg);
    }

    // Check for volume mounts
    if ((arg === '-v' || arg === '--volume') && nextArg) {
      const [hostPath] = nextArg.split(':');
      if (hostPath) {
        const isReadOnly = nextArg.endsWith(':ro');
        validateMountPath(hostPath, isReadOnly);
      }
    }

    // Check for device mounts (can be used for escape)
    if (arg === '--device' && nextArg) {
      logConfigTamperingDetected(
        'Container args',
        `Blocked device mount: ${nextArg}`,
      );
      throw new CloudEscapeError(
        `Cannot mount device '${nextArg}' - enables hardware access`,
        'DEVICE_MOUNT',
        'Device mounts can provide access to host hardware and bypass isolation',
      );
    }

    // Check for cgroup parent manipulation (container escape)
    if (arg === '--cgroup-parent' && nextArg) {
      logConfigTamperingDetected(
        'Container args',
        `Blocked cgroup-parent manipulation: ${nextArg}`,
      );
      throw new CloudEscapeError(
        'Cannot manipulate cgroup parent - enables resource limit bypass',
        'CGROUP_MANIPULATION',
        'Cgroup parent manipulation can bypass resource limits and enable escape',
      );
    }
  }

  return true;
}

/**
 * Checks if running inside a container.
 *
 * @returns True if inside container, false otherwise
 */
export function isInsideContainer(): boolean {
  try {
    // Check for /.dockerenv
    const fs = require('node:fs');
    if (fs.existsSync('/.dockerenv')) {
      return true;
    }

    // Check cgroup for docker/kubepods
    if (fs.existsSync('/proc/self/cgroup')) {
      const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
      if (cgroup.includes('docker') || cgroup.includes('kubepods')) {
        return true;
      }
    }

    // Check for container environment variables
    if (process.env['KUBERNETES_SERVICE_HOST'] || process.env['DOCKER_HOST']) {
      return true;
    }
  } catch {
    // Ignore errors, assume not in container
  }

  return false;
}

/**
 * Gets safe environment variables for container.
 * Only includes whitelisted variables.
 *
 * @param customAllowed Additional allowed variables
 * @returns Safe environment object
 */
export function getSafeEnvironmentForContainer(
  customAllowed: string[] = [],
): Record<string, string> {
  const allowed = new Set([
    'PATH',
    'HOME',
    'USER',
    'LANG',
    'LC_ALL',
    'TZ',
    'TERM',
    'COLORTERM',
    'NODE_ENV',
    'NODE_OPTIONS',
    'DEBUG',
    'TMPDIR',
    'TEMP',
    'TMP',
    ...customAllowed,
  ]);

  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value && allowed.has(key)) {
      safe[key] = value;
    }
  }

  return safe;
}

/**
 * Detects potential container escape attempts in logs/output.
 *
 * @param output Command output or log data
 * @returns True if escape attempt detected
 */
export function detectEscapeAttempt(output: string): boolean {
  const escapePatterns = [
    /pivot_root/i,
    /mount.*\/proc/i,
    /mount.*\/sys/i,
    /mount.*\/dev/i,
    /unshare/i,
    /nsenter/i,
    /docker.*socket/i,
    /\/var\/run\/docker\.sock/i,
    /\/var\/lib\/docker/i,
    /runc/i,
    /containerd/i,
    /cgroup.*write/i,
    /sys_admin/i,
    /cap_sys_admin/i,
    /proc\/.*\/root/i,
    /\/host/i,
  ];

  for (const pattern of escapePatterns) {
    if (pattern.test(output)) {
      logConfigTamperingDetected(
        'Container output',
        `Detected potential container escape attempt: pattern ${pattern} matched`,
      );
      return true;
    }
  }

  return false;
}

/**
 * Comprehensive validation of container configuration.
 *
 * @param config Container configuration object
 * @returns True if safe, throws CloudEscapeError if dangerous
 */
export function validateContainerConfig(config: {
  args?: string[];
  env?: Record<string, string | undefined>;
  mounts?: Array<{ source: string; target: string; readonly?: boolean }>;
  capabilities?: string[];
  privileged?: boolean;
}): boolean {
  // Check privileged mode
  if (config.privileged) {
    throw new CloudEscapeError(
      'Cannot run privileged container',
      'PRIVILEGED_CONTAINER',
    );
  }

  // Validate arguments
  if (config.args) {
    validateContainerArgs(config.args);
  }

  // Validate environment variables
  if (config.env) {
    for (const key of Object.keys(config.env)) {
      validateEnvironmentVariable(key);
    }
  }

  // Validate mount points
  if (config.mounts) {
    for (const mount of config.mounts) {
      validateMountPath(mount.source, mount.readonly);
    }
  }

  // Validate capabilities
  if (config.capabilities) {
    for (const cap of config.capabilities) {
      validateCapability(cap);
    }
  }

  return true;
}

/**
 * Creates a hardened container configuration.
 *
 * @param baseConfig Base configuration
 * @returns Hardened configuration
 */
export function createHardenedContainerConfig(
  baseConfig: Record<string, any>,
): Record<string, any> {
  const hardened = { ...baseConfig };

  // Remove dangerous flags
  delete hardened.privileged;

  // Ensure security options are set
  hardened.securityOpt = hardened.securityOpt || [];
  if (!hardened.securityOpt.includes('no-new-privileges:true')) {
    hardened.securityOpt.push('no-new-privileges:true');
  }

  // Drop all capabilities by default
  hardened.capDrop = ['ALL'];

  // Only add back essential capabilities if needed
  hardened.capAdd = (hardened.capAdd || []).filter((cap: string) => {
    try {
      validateCapability(cap);
      return true;
    } catch {
      return false;
    }
  });

  // Ensure read-only root filesystem if possible
  hardened.readOnlyRootfs = true;

  // Sanitize environment
  if (hardened.env) {
    hardened.env = sanitizeEnvironment(hardened.env);
  }

  return hardened;
}
