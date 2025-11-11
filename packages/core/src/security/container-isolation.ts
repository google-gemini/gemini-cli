/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Container Isolation Hardening - Strengthens container boundaries.
 *
 * SECURITY NOTE: Weak container isolation allows:
 * - Container escape to host system
 * - Access to other containers
 * - Resource exhaustion attacks
 * - Information leakage between tenants
 *
 * This module provides defense-in-depth for container security.
 */

/**
 * Secure defaults for container runtime security.
 */
export const SECURE_CONTAINER_DEFAULTS = {
  /**
   * Security options (Docker securityOpt).
   */
  securityOpt: [
    'no-new-privileges:true',  // Prevent privilege escalation
    'seccomp=default',          // Enable seccomp filtering
    'apparmor=docker-default',  // Enable AppArmor (Linux)
  ],

  /**
   * Capabilities to always drop (Docker capDrop).
   */
  capDrop: [
    'ALL',  // Drop all capabilities by default
  ],

  /**
   * Safe capabilities that can be added back (Docker capAdd).
   * These are the minimum needed for most applications.
   */
  safeCapabilities: [
    'CHOWN',          // Change file ownership
    'SETGID',         // Change GID (limited)
    'SETUID',         // Change UID (limited)
    'NET_BIND_SERVICE', // Bind to ports <1024
  ],

  /**
   * Resource limits.
   */
  resources: {
    memory: '512m',        // Maximum memory
    memorySwap: '512m',    // No swap (prevents DoS)
    cpus: '1.0',           // CPU limit
    pidsLimit: 100,        // Maximum processes
    ulimits: {
      nofile: { soft: 1024, hard: 2048 },  // Open files
      nproc: { soft: 50, hard: 100 },      // Processes
    },
  },

  /**
   * Network isolation.
   */
  network: {
    mode: 'bridge',  // Use bridge network, not host
    dns: ['8.8.8.8', '8.8.4.4'],  // Use public DNS
    dnsSearch: [],   // Empty DNS search domains
  },

  /**
   * Filesystem restrictions.
   */
  filesystem: {
    readOnlyRootfs: true,  // Read-only root filesystem
    tmpfs: {
      '/tmp': 'rw,noexec,nosuid,size=100m',  // Writable temp, no exec
      '/var/tmp': 'rw,noexec,nosuid,size=100m',
    },
  },

  /**
   * User namespace remapping.
   */
  userns: {
    mode: 'host',  // Use host user namespace (safer)
  },
};

/**
 * Validates and hardens Docker/Podman run command.
 *
 * @param args Docker/Podman run arguments
 * @returns Hardened arguments
 */
export function hardenContainerArgs(args: string[]): string[] {
  const hardened = [...args];
  const flags = new Set(args);

  // Remove dangerous flags
  const dangerousFlags = ['--privileged', '--pid=host', '--ipc=host', '--net=host'];
  for (const flag of dangerousFlags) {
    const index = hardened.indexOf(flag);
    if (index !== -1) {
      logConfigTamperingDetected(
        'Container args',
        `Removed dangerous flag: ${flag}`,
      );
      hardened.splice(index, 1);
    }
  }

  // Add security options if not present
  if (!flags.has('--security-opt')) {
    for (const opt of SECURE_CONTAINER_DEFAULTS.securityOpt) {
      hardened.push('--security-opt', opt);
    }
  }

  // Add capability drops if not present
  if (!flags.has('--cap-drop')) {
    hardened.push('--cap-drop', 'ALL');
  }

  // Add resource limits if not present
  if (!flags.has('--memory') && !flags.has('-m')) {
    hardened.push('--memory', SECURE_CONTAINER_DEFAULTS.resources.memory);
    hardened.push('--memory-swap', SECURE_CONTAINER_DEFAULTS.resources.memorySwap);
  }

  if (!flags.has('--cpus')) {
    hardened.push('--cpus', SECURE_CONTAINER_DEFAULTS.resources.cpus);
  }

  if (!flags.has('--pids-limit')) {
    hardened.push('--pids-limit', String(SECURE_CONTAINER_DEFAULTS.resources.pidsLimit));
  }

  // Add read-only root if not present
  if (!flags.has('--read-only')) {
    hardened.push('--read-only');
  }

  // Add tmpfs for /tmp if not present
  if (!flags.has('--tmpfs')) {
    for (const [path, opts] of Object.entries(SECURE_CONTAINER_DEFAULTS.filesystem.tmpfs)) {
      hardened.push('--tmpfs', `${path}:${opts}`);
    }
  }

  // Ensure non-root user if not already specified
  const hasUserFlag = args.some((arg, i) =>
    arg === '--user' || arg === '-u' || (i > 0 && (args[i - 1] === '--user' || args[i - 1] === '-u'))
  );

  if (!hasUserFlag) {
    // Run as non-root user (UID 1000 is common for non-root)
    hardened.push('--user', '1000:1000');
  }

  return hardened;
}

/**
 * Seccomp profile for additional syscall filtering.
 * Blocks dangerous syscalls that can be used for escape.
 */
export const SECCOMP_PROFILE = {
  defaultAction: 'SCMP_ACT_ERRNO',
  architectures: [
    'SCMP_ARCH_X86_64',
    'SCMP_ARCH_X86',
    'SCMP_ARCH_X32',
  ],
  syscalls: [
    {
      names: [
        // Dangerous syscalls to block
        'add_key',
        'bpf',
        'clock_adjtime',
        'clock_settime',
        'clone',  // Can escape via new namespaces
        'create_module',
        'delete_module',
        'finit_module',
        'get_kernel_syms',
        'get_mempolicy',
        'init_module',
        'ioperm',
        'iopl',
        'kcmp',
        'kexec_file_load',
        'kexec_load',
        'keyctl',
        'lookup_dcookie',
        'mbind',
        'modify_ldt',
        'mount',  // Can mount filesystems
        'move_pages',
        'name_to_handle_at',
        'open_by_handle_at',
        'perf_event_open',
        'personality',
        'pivot_root',  // Used in container escape
        'process_vm_readv',
        'process_vm_writev',
        'ptrace',  // Can debug and inject into processes
        'query_module',
        'quotactl',
        'reboot',
        'request_key',
        'set_mempolicy',
        'setns',  // Join other namespaces
        'settimeofday',
        'swapon',
        'swapoff',
        'sysfs',
        '_sysctl',
        'umount',
        'umount2',
        'unshare',  // Create new namespaces
        'uselib',
        'userfaultfd',
        'ustat',
        'vm86',
        'vm86old',
      ],
      action: 'SCMP_ACT_ERRNO',
      args: [],
    },
  ],
};

/**
 * AppArmor profile for additional MAC (Mandatory Access Control).
 */
export const APPARMOR_PROFILE = `
#include <tunables/global>

profile docker-gemini-cli flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>

  # Deny access to sensitive files
  deny /proc/sys/kernel/** wklx,
  deny /sys/kernel/** wklx,
  deny /sys/devices/** wklx,
  deny /sys/module/** wklx,

  # Deny access to host filesystem
  deny /proc/** wklx,
  deny /sys/** wklx,
  deny /dev/** wklx,

  # Deny capability operations
  deny capability sys_admin,
  deny capability sys_module,
  deny capability sys_rawio,
  deny capability sys_ptrace,
  deny capability dac_override,
  deny capability dac_read_search,
  deny capability setuid,
  deny capability setgid,

  # Allow limited network access
  network inet stream,
  network inet dgram,
  network inet6 stream,
  network inet6 dgram,

  # Deny raw sockets (can be used for network attacks)
  deny network raw,
  deny network packet,

  # Allow standard file operations in allowed directories
  /tmp/** rw,
  /var/tmp/** rw,
  /home/** rw,
  /workspace/** rw,
}
`;

/**
 * Validates container is properly isolated.
 *
 * @returns Isolation check results
 */
export function checkContainerIsolation(): {
  isolated: boolean;
  warnings: string[];
  vulnerabilities: string[];
} {
  const warnings: string[] = [];
  const vulnerabilities: string[] = [];

  try {
    const fs = require('node:fs');

    // Check if in privileged mode
    try {
      if (fs.existsSync('/proc/self/status')) {
        const status = fs.readFileSync('/proc/self/status', 'utf8');

        // Check for capabilities
        const capEffMatch = status.match(/CapEff:\s*([0-9a-f]+)/i);
        if (capEffMatch) {
          const capEff = parseInt(capEffMatch[1], 16);
          // If all capabilities (0x3fffffffff or similar), we're privileged
          if (capEff > 0x3ffffff) {
            vulnerabilities.push('Container has excessive capabilities - possible privileged mode');
          }
        }
      }
    } catch {
      warnings.push('Could not check capabilities');
    }

    // Check for host PID namespace
    try {
      if (fs.existsSync('/proc/1/cgroup')) {
        const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
        if (!cgroup.includes('docker') && !cgroup.includes('kubepods')) {
          vulnerabilities.push('Not in proper container cgroup - possible host PID namespace');
        }
      }
    } catch {
      warnings.push('Could not check PID namespace');
    }

    // Check for writable /proc/sys
    try {
      fs.accessSync('/proc/sys', fs.constants.W_OK);
      vulnerabilities.push('/proc/sys is writable - kernel parameters can be modified');
    } catch {
      // Good - /proc/sys should not be writable
    }

    // Check for access to Docker socket
    try {
      if (fs.existsSync('/var/run/docker.sock')) {
        vulnerabilities.push('Docker socket is accessible - enables container escape');
      }
    } catch {
      // Good - socket should not be accessible
    }

    // Check for /dev/kvm access (VM escape)
    try {
      if (fs.existsSync('/dev/kvm')) {
        vulnerabilities.push('/dev/kvm is accessible - enables VM-level access');
      }
    } catch {
      // Good - KVM should not be accessible
    }

    // Check for user namespace
    try {
      const uid = process.getuid?.();
      const gid = process.getgid?.();

      if (uid === 0 || gid === 0) {
        warnings.push('Running as root inside container - not recommended');
      }
    } catch {
      warnings.push('Could not check user ID');
    }
  } catch (error) {
    warnings.push(`Isolation check failed: ${(error as Error).message}`);
  }

  const isolated = vulnerabilities.length === 0;

  if (!isolated) {
    logConfigTamperingDetected(
      'Container isolation',
      `Container isolation vulnerabilities found: ${vulnerabilities.join(', ')}`,
    );
  }

  return { isolated, warnings, vulnerabilities };
}

/**
 * Gets recommended security configuration for container runtime.
 *
 * @param runtime Container runtime (docker, podman, etc.)
 * @returns Security configuration
 */
export function getSecurityConfig(runtime: 'docker' | 'podman' | 'containerd'): {
  args: string[];
  description: string;
} {
  const baseArgs = [
    '--security-opt', 'no-new-privileges:true',
    '--cap-drop', 'ALL',
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m',
    '--memory', '512m',
    '--memory-swap', '512m',
    '--cpus', '1.0',
    '--pids-limit', '100',
  ];

  if (runtime === 'docker') {
    return {
      args: [
        ...baseArgs,
        '--security-opt', 'seccomp=default',
        '--security-opt', 'apparmor=docker-default',
        '--userns', 'host',
      ],
      description: 'Docker with seccomp, AppArmor, and user namespace isolation',
    };
  } else if (runtime === 'podman') {
    return {
      args: [
        ...baseArgs,
        '--security-opt', 'label=type:container_runtime_t',
        '--userns', 'keep-id',  // Podman-specific user namespace
      ],
      description: 'Podman with SELinux and user namespace isolation',
    };
  } else {
    return {
      args: baseArgs,
      description: 'Basic containerd security configuration',
    };
  }
}

/**
 * Validates container runtime configuration file.
 *
 * @param configPath Path to runtime configuration
 * @returns Validation results
 */
export function validateRuntimeConfig(configPath: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  try {
    const fs = require('node:fs');
    if (!fs.existsSync(configPath)) {
      issues.push(`Configuration file not found: ${configPath}`);
      return { valid: false, issues };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Check for insecure defaults
    if (config.default === 'privileged') {
      issues.push('Default runtime is privileged mode');
    }

    if (config['no-new-privileges'] === false) {
      issues.push('no-new-privileges is disabled');
    }

    if (config.seccomp === 'unconfined') {
      issues.push('seccomp is unconfined');
    }

    if (config['userns-remap'] === '') {
      issues.push('User namespace remapping is not configured');
    }
  } catch (error) {
    issues.push(`Failed to validate config: ${(error as Error).message}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Creates a minimal container image configuration.
 * Returns Dockerfile content for a hardened base image.
 */
export function createMinimalImageDockerfile(): string {
  return `
# Minimal hardened base image
FROM alpine:latest

# Install minimal required packages
RUN apk add --no-cache \\
    ca-certificates \\
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Remove setuid/setgid binaries to prevent privilege escalation
RUN find / -perm /6000 -type f -exec chmod a-s {} \\; || true

# Remove unnecessary packages that could be used for escape
RUN apk del apk-tools

# Set non-root user
USER appuser

# Set working directory
WORKDIR /app

# Disable shell access
SHELL ["/bin/false"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD true

# Run as PID 1 with proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["/app/start.sh"]
`.trim();
}
